import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { enrichMoviesWithTmdb } from "../scraper/tmdb.mjs";

const movie = { id: "parasite", title: "Parazit", releaseYear: "2019", durationMinutes: 132 };
const detail = {
  id: 496243,
  title: "Parazit",
  original_title: "기생충",
  original_language: "ko",
  release_date: "2019-05-30",
  runtime: 133,
  imdb_id: "tt6751668",
  vote_average: 8.5,
  vote_count: 19_000,
  poster_path: "/parasite.jpg",
  backdrop_path: "/parasite-backdrop.jpg",
  videos: { results: [{ site: "YouTube", key: "parasite123", type: "Trailer", official: true, iso_639_1: "en" }] },
  production_countries: [{ iso_3166_1: "KR", name: "South Korea" }],
  credits: {
    crew: [{ job: "Director", name: "Bong Joon Ho" }],
    cast: ["Song Kang-ho", "Lee Sun-kyun", "Cho Yeo-jeong", "Choi Woo-shik", "Park So-dam", "Jang Hye-jin", "Lee Jung-eun"]
      .map((name, index) => ({ name, character: `Postava ${index + 1}`, profile_path: index ? null : "/song.jpg" })),
  },
  translations: { translations: [
    { iso_639_1: "sk", data: { overview: "Slovenský popis." } },
    { iso_639_1: "cs", data: { overview: "Český popis." } },
    { iso_639_1: "en", data: { overview: "English synopsis." } },
  ] },
};

async function cachePath() {
  return join(await mkdtemp(join(tmpdir(), "dokina-metadata-")), "tmdb.json");
}

function tmdbRequest(film) {
  return async (path) => path === "search/movie" ? { results: [film], total_pages: 1 } : film;
}

test("TMDB fills missing metadata and replaces the cinema poster", async () => {
  const [result] = await enrichMoviesWithTmdb([{ ...movie, directors: ["Bong Joon Ho"],
    posterUrl: "https://cinema.example/poster.jpg" }], {
    apiKey: "test", cachePath: await cachePath(), request: tmdbRequest(detail),
  });
  assert.deepEqual(result.directors, ["Bong Joon Ho"]);
  assert.deepEqual(result.actors, ["Song Kang-ho", "Lee Sun-kyun", "Cho Yeo-jeong", "Choi Woo-shik", "Park So-dam", "Jang Hye-jin"]);
  assert.deepEqual(result.cast[0], {
    name: "Song Kang-ho", character: "Postava 1", profileUrl: "https://image.tmdb.org/t/p/w185/song.jpg",
  });
  assert.equal(result.cast.length, 6);
  assert.equal(result.posterUrl, "https://image.tmdb.org/t/p/w500/parasite.jpg");
  assert.equal(result.backdropUrl, "https://image.tmdb.org/t/p/w1280/parasite-backdrop.jpg");
  assert.equal(result.trailerUrl, "https://www.youtube.com/watch?v=parasite123");
  assert.equal(result.originalTitle, "기생충");
  assert.equal(result.originalLanguage, "ko");
  assert.equal(result.tmdbId, 496243);
  assert.equal(result.durationMinutes, 132);
  assert.deepEqual(result.productionCountries, ["KR"]);
});

test("TMDB chooses Slovak, Czech, then English overview", async () => {
  for (const language of ["sk", "cs", "en"]) {
    const film = { ...detail, translations: { translations: detail.translations.translations.filter(
      (item) => ["sk", "cs", "en"].indexOf(item.iso_639_1) >= ["sk", "cs", "en"].indexOf(language)) } };
    const [result] = await enrichMoviesWithTmdb([movie], {
      apiKey: "test", cachePath: await cachePath(), request: tmdbRequest(film),
    });
    assert.equal(result.overviewLanguage, language);
    assert.equal(result.id, movie.id);
  }
});

test("an ambiguous TMDB match supplies no metadata", async () => {
  const [result] = await enrichMoviesWithTmdb([movie], {
    apiKey: "test", cachePath: await cachePath(),
    request: async (path) => path === "search/movie"
      ? { results: [detail, { ...detail, id: 2 }], total_pages: 1 }
      : { ...detail, id: Number(path.split("/")[1]) },
  });
  assert.equal(result.overview, undefined);
  assert.equal(result.directors, undefined);
  assert.equal(result.tmdbId, undefined);
});
