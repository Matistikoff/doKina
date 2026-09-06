import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { lookupTitles, resolveTmdbImdbId } from "../scraper/tmdb.mjs";
import { enrichMoviesWithOmdb } from "../scraper/omdb.mjs";
import { applyKnownMovieIdentity } from "../scraper/movie-identities.mjs";

test("confirmed film metadata is scoped to its source record and preserves IDs", () => {
  const movie = { id: "movie-nenavist", source: "kino-nostalgia", externalId: "11420", title: "Nenávisť" };
  assert.deepEqual(applyKnownMovieIdentity(movie), { ...movie, originalTitle: "La Haine", releaseYear: "1995" });
  for (const change of [{ externalId: "999" }, { source: "other" }, { releaseYear: "2004" }, { originalTitle: "The Grudge" }]) {
    const other = { ...movie, ...change };
    assert.deepEqual(applyKnownMovieIdentity(other), other);
  }
});

const haine = {
  id: 406, title: "Nenávisť", original_title: "La Haine", release_date: "1995-05-31",
  imdb_id: "tt0113247", runtime: 98,
  credits: { crew: [{ job: "Director", name: "Mathieu Kassovitz" }] },
};

function tmdbMock(films = [haine]) {
  return async (path) => path === "search/movie"
    ? { results: films, total_pages: 1 }
    : films.find((film) => path === `movie/${film.id}`);
}

test("resolves a unique Slovak title to the IMDb identity, including alternative titles", async () => {
  assert.equal(await resolveTmdbImdbId({ title: "Nenávisť" }, "test", tmdbMock()), "tt0113247");
  const alternate = { ...haine, title: "La Haine", alternative_titles: { titles: [{ title: "Nenávisť" }] } };
  assert.equal(await resolveTmdbImdbId({ title: "Nenávisť" }, "test", tmdbMock([alternate])), "tt0113247");
});

test("rejects wrong years, directors, durations and fuzzy titles", async () => {
  for (const movie of [
    { title: "Nenávisť", releaseYear: 2026 },
    { title: "Nenávisť", directors: ["Other Director"] },
    { title: "Nenávisť", durationMinutes: 130 },
    { title: "Nenávisť 2" },
  ]) assert.equal(await resolveTmdbImdbId(movie, "test", tmdbMock()), null);
});

test("does not select the popular result when a remake is ambiguous or search is truncated", async () => {
  const remake = { ...haine, id: 407, release_date: "2020-01-01", imdb_id: null };
  assert.equal(await resolveTmdbImdbId({ title: "Nenávisť" }, "test", tmdbMock([haine, remake])), null);
  assert.equal(await resolveTmdbImdbId({ title: "Nenávisť", releaseYear: 1995 }, "test", tmdbMock([haine, remake])), "tt0113247");
  assert.equal(await resolveTmdbImdbId({ title: "Nenávisť" }, "test", async () => ({ results: [haine], total_pages: 2 })), null);
});

test("cleans event labels without splitting double features or sequel numbers", () => {
  assert.deepEqual(lookupTitles({ title: "20. VÝROČIE FILMU WHOLETRAIN + beseda s režisérom" }), ["WHOLETRAIN"]);
  assert.deepEqual(lookupTitles({ title: "Domáca úroda: KAVEJ 2 | Filmový večer" }), ["KAVEJ 2"]);
  assert.deepEqual(lookupTitles({ title: "Pozdravy z Rodosu + Zakorenení vo vode" }), ["Pozdravy z Rodosu + Zakorenení vo vode"]);
});

test("replaces an old unrated wrong IMDb ID and caches the TMDb identity", async () => {
  const cachePath = join(await mkdtemp(join(tmpdir(), "dokina-tmdb-")), "omdb.json");
  const now = new Date("2026-09-06T18:00:00Z");
  const movie = { id: "nenavist", title: "Nenávisť", imdbId: "tt2852532", imdbRating: null };
  await writeFile(cachePath, JSON.stringify({ version: 4, entries: {
    nenavist: { imdbId: "tt2852532", imdbRating: null, fetchedAt: now.toISOString() },
  } }));
  const options = {
    apiKey: "test", tmdbApiKey: "test", cachePath, now, tmdbRequest: tmdbMock(),
    request: async (parameters) => {
      assert.deepEqual(parameters, { i: "tt0113247" });
      return { Response: "True", imdbID: "tt0113247", imdbRating: "8.1", imdbVotes: "100,000" };
    },
    wikidataRequest: async () => assert.fail("TMDb already resolved the film"),
  };
  const [result] = await enrichMoviesWithOmdb([movie], options);
  assert.equal(result.imdbId, "tt0113247");
  assert.equal(result.imdbRating, 8.1);
  await enrichMoviesWithOmdb([movie], { ...options, tmdbRequest: async () => assert.fail("cached") });
  assert.equal(JSON.parse(await readFile(cachePath, "utf8")).entries.nenavist.resolvedBy, "tmdb");
});

test("enabling TMDb retries a previously cached miss immediately", async () => {
  const cachePath = join(await mkdtemp(join(tmpdir(), "dokina-tmdb-")), "omdb.json");
  const movie = { id: "nenavist", title: "Nenávisť" };
  const options = { apiKey: "test", cachePath, request: async () => ({ Response: "False", Error: "Movie not found!" }),
    wikidataRequest: async () => ({ search: [] }) };
  await enrichMoviesWithOmdb([movie], options);
  const [result] = await enrichMoviesWithOmdb([movie], { ...options, tmdbApiKey: "test", tmdbRequest: tmdbMock(),
    request: async () => ({ Response: "True", imdbID: "tt0113247", imdbRating: "8.1" }) });
  assert.equal(result.imdbRating, 8.1);
});

test("TMDb failure leaves misses retryable and preserves existing ratings", async () => {
  const cachePath = join(await mkdtemp(join(tmpdir(), "dokina-tmdb-")), "omdb.json");
  const movies = [{ id: "unknown", title: "Unknown" }, { id: "rated", title: "Rated", imdbId: "tt1234", imdbRating: 8 }];
  const result = await enrichMoviesWithOmdb(movies, {
    apiKey: "test", tmdbApiKey: "test", cachePath,
    tmdbRequest: async () => { throw new Error("HTTP 429"); },
    request: async ({ i }) => i ? { Response: "True", imdbID: i, imdbRating: "8" } : { Response: "False", Error: "Movie not found!" },
    wikidataRequest: async () => ({ search: [] }),
  });
  assert.equal(result[1].imdbRating, 8);
  assert.equal(JSON.parse(await readFile(cachePath, "utf8")).entries.unknown, undefined);
});
