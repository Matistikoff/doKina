import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { enrichMoviesWithOmdb } from "../scraper/omdb.mjs";

const movie = { id: "parasite", title: "Parazit", releaseYear: "2019", durationMinutes: 132 };
const detail = { id: 496243, title: "Parazit", original_title: "기생충", release_date: "2019-05-30",
  runtime: 133, imdb_id: "tt6751668", credits: { crew: [{ job: "Director", name: "Bong Joon Ho" }] },
  translations: { translations: [
    { iso_639_1: "sk", data: { overview: "Slovenský popis." } },
    { iso_639_1: "cs", data: { overview: "Český popis." } },
    { iso_639_1: "en", data: { overview: "English synopsis." } },
  ] } };
const payload = { Response: "True", imdbID: "tt6751668", imdbRating: "8.5", Director: "Bong Joon Ho",
  Title: "Parasite", Runtime: "132 min", Year: "2019", Plot: "English synopsis." };
const cachePath = async () => join(await mkdtemp(join(tmpdir(), "dokina-metadata-")), "omdb.json");
const tmdbRequest = (film) => async (path) => path === "search/movie" ? { results: [film] } : film;

test("OMDb fills metadata and ignores missing values without replacing cinema data", async () => {
  const [result] = await enrichMoviesWithOmdb([{ ...movie, directors: ["Cinema director"], englishTitle: "Parasite" }], {
    apiKey: "test", cachePath: await cachePath(), request: async () => payload,
  });
  assert.deepEqual(result.directors, ["Cinema director"]);
  assert.equal(result.overview, payload.Plot);
  assert.equal(result.overviewLanguage, "en");
  const [empty] = await enrichMoviesWithOmdb([movie], { apiKey: "test", cachePath: await cachePath(),
    request: async () => ({ ...payload, Title: "Parazit", Director: "N/A", Plot: "N/A", Runtime: "N/A" }),
  });
  assert.equal(empty.overview, undefined);
  assert.equal(empty.directors, undefined);
  assert.equal(empty.durationMinutes, 132);
});

test("TMDb fills missing direction and original title, choosing Slovak, Czech, then English", async () => {
  for (const language of ["sk", "cs", "en"]) {
    const film = { ...detail, translations: { translations: detail.translations.translations.filter(
      (item) => ["sk", "cs", "en"].indexOf(item.iso_639_1) >= ["sk", "cs", "en"].indexOf(language)) } };
    const [result] = await enrichMoviesWithOmdb([movie], { tmdbApiKey: "test", cachePath: await cachePath(),
      tmdbRequest: tmdbRequest(film), request: async () => assert.fail("OMDb is disabled"),
    });
    assert.deepEqual(result.directors, ["Bong Joon Ho"]);
    assert.equal(result.originalTitle, "기생충");
    assert.equal(result.durationMinutes, 132);
    assert.equal(result.overviewLanguage, language);
    assert.equal(result.id, movie.id);
  }
});

test("upgrades a fresh rating-only cache and keeps metadata through an OMDb outage", async () => {
  const path = await cachePath();
  const now = new Date("2026-09-06T12:00:00Z");
  await writeFile(path, JSON.stringify({ version: 4, entries: { parasite: {
    imdbId: payload.imdbID, imdbRating: 8.5, fetchedAt: now.toISOString(),
  } } }));
  const [result] = await enrichMoviesWithOmdb([{ ...movie, imdbId: payload.imdbID, imdbRating: 8.5 }], {
    apiKey: "test", tmdbApiKey: "test", cachePath: path, now, tmdbRequest: tmdbRequest(detail),
    request: async () => { throw new Error("Quota exceeded"); },
  });
  assert.equal(result.imdbRating, 8.5);
  assert.equal(result.overviewLanguage, "sk");
  const [saved] = await enrichMoviesWithOmdb([movie], { cachePath: await cachePath(), previousMovies: [result] });
  assert.equal(saved.overview, result.overview);
  assert.deepEqual(saved.directors, result.directors);
});

test("an ambiguous TMDb match supplies no metadata", async () => {
  const [result] = await enrichMoviesWithOmdb([movie], { tmdbApiKey: "test", cachePath: await cachePath(),
    tmdbRequest: async (path) => path === "search/movie"
      ? { results: [detail, { ...detail, id: 2 }] } : { ...detail, id: Number(path.split("/")[1]) },
  });
  assert.equal(result.overview, undefined);
  assert.equal(result.directors, undefined);
});
