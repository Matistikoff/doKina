import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  enrichMoviesWithTmdb,
  lookupTitles,
  preserveTmdbMetadata,
  resolveTmdbMovie,
  selectPoster,
} from "../scraper/tmdb.mjs";
import { applyKnownMovieIdentity } from "../scraper/movie-identities.mjs";

const haine = {
  id: 406,
  title: "Nenávisť",
  original_title: "La Haine",
  release_date: "1995-05-31",
  imdb_id: "tt0113247",
  runtime: 98,
  vote_average: 8.1,
  vote_count: 4100,
  credits: { crew: [{ job: "Director", name: "Mathieu Kassovitz" }] },
  images: { posters: [{ file_path: "/haine-sk.jpg", iso_639_1: "sk", vote_count: 2 }] },
};

function tmdbMock(films = [haine]) {
  return async (path) => path === "search/movie"
    ? { results: films, total_pages: 1 }
    : films.find((film) => path === `movie/${film.id}`);
}

async function cachePath() {
  return join(await mkdtemp(join(tmpdir(), "dokina-tmdb-")), "tmdb.json");
}

test("confirmed film metadata is scoped to its source record and preserves IDs", () => {
  const movie = { id: "movie-nenavist", source: "kino-nostalgia", externalId: "11420", title: "Nenávisť" };
  assert.deepEqual(applyKnownMovieIdentity(movie), { ...movie, originalTitle: "La Haine", releaseYear: "1995" });
  for (const change of [{ externalId: "999" }, { source: "other" }, { releaseYear: "2004" }, { originalTitle: "The Grudge" }]) {
    const other = { ...movie, ...change };
    assert.deepEqual(applyKnownMovieIdentity(other), other);
  }
});

test("resolves a unique localized title with IDs, rating and poster", async () => {
  const result = await resolveTmdbMovie({ title: "Nenávisť" }, "test", tmdbMock());
  assert.equal(result.tmdbId, 406);
  assert.equal(result.imdbId, "tt0113247");
  assert.equal(result.tmdbRating, 8.1);
  assert.equal(result.tmdbVotes, 4100);
  assert.equal(result.posterUrl, "https://image.tmdb.org/t/p/w500/haine-sk.jpg");

  const alternate = { ...haine, title: "La Haine", alternative_titles: { titles: [{ title: "Nenávisť" }] } };
  assert.equal((await resolveTmdbMovie({ title: "Nenávisť" }, "test", tmdbMock([alternate]))).tmdbId, 406);
});

test("prefers Slovak, Czech, language-neutral and English posters in that order", () => {
  const posters = [
    { file_path: "/en.jpg", iso_639_1: "en", vote_count: 100 },
    { file_path: "/neutral.jpg", iso_639_1: null, vote_count: 100 },
    { file_path: "/cs.jpg", iso_639_1: "cs", vote_count: 1 },
    { file_path: "/sk-low.jpg", iso_639_1: "sk", vote_count: 1, vote_average: 5 },
    { file_path: "/sk-best.jpg", iso_639_1: "sk", vote_count: 2, vote_average: 4 },
  ];
  assert.equal(selectPoster({ images: { posters } }), "https://image.tmdb.org/t/p/w500/sk-best.jpg");
  assert.equal(selectPoster({ images: { posters: [] }, poster_path: "/fallback.jpg" }),
    "https://image.tmdb.org/t/p/w500/fallback.jpg");
});

test("rejects wrong years, directors, durations, IMDb IDs and fuzzy titles", async () => {
  for (const movie of [
    { title: "Nenávisť", releaseYear: 2026 },
    { title: "Nenávisť", directors: ["Other Director"] },
    { title: "Nenávisť", durationMinutes: 130 },
    { title: "Nenávisť", imdbId: "tt9999999" },
    { title: "Nenávisť 2" },
  ]) assert.equal(await resolveTmdbMovie(movie, "test", tmdbMock()), null);
});

test("does not select a popular result when a remake is ambiguous or search is truncated", async () => {
  const remake = { ...haine, id: 407, release_date: "2020-01-01", imdb_id: null };
  assert.equal(await resolveTmdbMovie({ title: "Nenávisť" }, "test", tmdbMock([haine, remake])), null);
  assert.equal((await resolveTmdbMovie({ title: "Nenávisť", releaseYear: 1995 }, "test", tmdbMock([haine, remake]))).tmdbId, 406);
  assert.equal(await resolveTmdbMovie({ title: "Nenávisť" }, "test",
    async () => ({ results: [haine], total_pages: 2 })), null);
});

test("cleans event labels without splitting double features or sequel numbers", () => {
  assert.deepEqual(lookupTitles({ title: "20. VÝROČIE FILMU WHOLETRAIN + beseda s režisérom" }), ["WHOLETRAIN"]);
  assert.deepEqual(lookupTitles({ title: "Domáca úroda: KAVEJ 2 | Filmový večer" }), ["KAVEJ 2"]);
  assert.deepEqual(lookupTitles({ title: "Pozdravy z Rodosu + Zakorenení vo vode" }), ["Pozdravy z Rodosu + Zakorenení vo vode"]);
});

test("enriches, caches and reuses a fresh TMDB result", async () => {
  const path = await cachePath();
  const movies = [{ id: "nenavist", title: "Nenávisť" }];
  const now = new Date("2026-09-08T10:00:00Z");
  const [result] = await enrichMoviesWithTmdb(movies, { apiKey: "test", cachePath: path, now, request: tmdbMock() });
  assert.equal(result.tmdbRating, 8.1);
  assert.equal(JSON.parse(await readFile(path, "utf8")).entries.nenavist.tmdbId, 406);
  const [cached] = await enrichMoviesWithTmdb(movies, {
    apiKey: "test", cachePath: path, now: new Date("2026-09-08T12:00:00Z"),
    request: async () => assert.fail("fresh cache should avoid requests"),
  });
  assert.equal(cached.posterUrl, result.posterUrl);
});

test("keeps cinema posters and stale TMDB data during an outage", async () => {
  const path = await cachePath();
  const movie = { id: "nenavist", title: "Nenávisť", posterUrl: "https://cinema.example/poster.jpg" };
  const [initial] = await enrichMoviesWithTmdb([movie], {
    apiKey: "test", cachePath: path, now: new Date("2026-09-01T10:00:00Z"), request: tmdbMock(),
  });
  assert.equal(initial.posterUrl, movie.posterUrl);
  const [stale] = await enrichMoviesWithTmdb([movie], {
    apiKey: "test", cachePath: path, now: new Date("2026-09-03T10:00:00Z"),
    request: async () => { throw new Error("Service unavailable"); },
  });
  assert.equal(stale.tmdbRating, 8.1);
  assert.equal(stale.posterUrl, movie.posterUrl);
});

test("preserves unambiguous previous TMDB metadata without an API key", async () => {
  const movie = { id: "new-id", title: "Nenávisť", releaseYear: "1995" };
  const previous = { ...movie, id: "old-id", tmdbId: 406, tmdbRating: 8.1, tmdbVotes: 4100,
    posterUrl: "https://image.tmdb.org/t/p/w500/haine-sk.jpg" };
  assert.equal(preserveTmdbMetadata([movie], [previous])[0].tmdbId, 406);
  const [result] = await enrichMoviesWithTmdb([movie], {
    cachePath: await cachePath(), previousMovies: [previous],
    request: async () => assert.fail("no request without an API key"),
  });
  assert.equal(result.tmdbRating, 8.1);
});
