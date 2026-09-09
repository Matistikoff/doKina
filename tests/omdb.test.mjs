import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { enrichMoviesWithOmdb, preserveMovieRatings, parseOmdbDetails } from "../scraper/omdb.mjs";
import { ratingAudit } from "../scraper/rating-audit.mjs";

const details = JSON.parse(await readFile(new URL("./fixtures/omdb-movie.json", import.meta.url), "utf8"));

test("parses Oscar wins, critics scores and dollar box office from OMDb", () => {
  assert.deepEqual(parseOmdbDetails(details), {
    oscarWins: 4, metascore: 82, rottenTomatoesRating: 93, boxOfficeUsd: 123456789,
  });
  assert.equal(parseOmdbDetails({ Awards: "Won 1 Oscar. 5 wins total" }).oscarWins, 1);
  for (const Awards of ["Nominated for 4 Oscars. 12 wins total", "12 wins & 4 nominations.", "N/A", undefined]) {
    assert.equal(parseOmdbDetails({ Awards }).oscarWins, 0);
  }
});

test("rejects missing and malformed OMDb details while keeping zero scores", () => {
  assert.deepEqual(parseOmdbDetails({ Metascore: "N/A", BoxOffice: "N/A" }), {
    oscarWins: 0, metascore: null, rottenTomatoesRating: null, boxOfficeUsd: null,
  });
  assert.equal(parseOmdbDetails({ Metascore: "0" }).metascore, 0);
  for (const value of ["101", "-1", "82oops"]) {
    assert.equal(parseOmdbDetails({ Metascore: value }).metascore, null);
    assert.equal(parseOmdbDetails({ Ratings: [{ Source: "Rotten Tomatoes", Value: `${value}%` }] }).rottenTomatoesRating, null);
  }
  assert.equal(parseOmdbDetails({ BoxOffice: "$12oops" }).boxOfficeUsd, null);
});

test("uses verified ČSFD aliases and distinguishes missing rating from missing movie", async () => {
  for (const [payload, status] of [
    [{ Response: "True", imdbID: "tt1234", Title: "Five Plums", Year: "2026", imdbRating: "N/A" }, "rating-unavailable"],
    [{ Response: "False", Error: "Movie not found!" }, "not-found"],
  ]) {
    const diagnostics = [];
    const requests = [];
    const result = await enrichMoviesWithOmdb([{ id: "plums", title: "Pět švestek", releaseYear: "2026", alternativeTitles: ["Five Plums"] }], {
      apiKey: "test", cachePath: await cachePath(), diagnostics,
      request: async (params) => { requests.push(params); return params.t === "Five Plums" ? payload : { Response: "False", Error: "Movie not found!" }; },
    });
    assert.ok(requests.some((params) => params.t === "Five Plums"));
    assert.equal(ratingAudit(result, diagnostics).missingImdb[0].status, status);
  }
});

async function cachePath() {
  return join(await mkdtemp(join(tmpdir(), "dokina-omdb-")), "omdb.json");
}

test("fetches an IMDb rating by the IMDb ID supplied by TMDB", async () => {
  const path = await cachePath();
  const requests = [];
  const [result] = await enrichMoviesWithOmdb([{
    id: "matrix", title: "Matrix", releaseYear: "1999", tmdbId: 603, imdbId: "tt0133093",
  }], {
    apiKey: "test",
    cachePath: path,
    request: async (parameters) => {
      requests.push(parameters);
      return { Response: "True", imdbID: "tt0133093", imdbRating: "8.7", imdbVotes: "2,100,000" };
    },
  });
  assert.deepEqual(requests, [{ i: "tt0133093" }]);
  assert.equal(result.imdbRating, 8.7);
  assert.equal(result.imdbVotes, 2_100_000);
  assert.equal(JSON.parse(await readFile(path, "utf8")).entries.matrix.imdbRating, 8.7);
});

test("falls back to an exact title and year when TMDB has no IMDb ID", async () => {
  const requests = [];
  const [result] = await enrichMoviesWithOmdb([{
    id: "matrix", title: "Matrix", originalTitle: "The Matrix", releaseYear: "1999",
  }], {
    apiKey: "test",
    cachePath: await cachePath(),
    request: async (parameters) => {
      requests.push(parameters);
      return { Response: "True", imdbID: "tt0133093", imdbRating: "8.7", imdbVotes: "100" };
    },
  });
  assert.deepEqual(requests, [{ t: "The Matrix", type: "movie", y: "1999" }]);
  assert.equal(result.imdbId, "tt0133093");
  assert.equal(result.imdbRating, 8.7);
});

test("keeps a stale IMDb rating when OMDb is unavailable", async () => {
  const path = await cachePath();
  const movie = { id: "matrix", title: "Matrix", releaseYear: "1999", imdbId: "tt0133093" };
  await enrichMoviesWithOmdb([movie], {
    apiKey: "test", cachePath: path, now: new Date("2026-09-01T10:00:00Z"),
    request: async () => ({ Response: "True", imdbID: "tt0133093", imdbRating: "8.7", imdbVotes: "100" }),
  });
  const [result] = await enrichMoviesWithOmdb([movie], {
    apiKey: "test", cachePath: path, now: new Date("2026-09-03T10:00:00Z"),
    request: async () => { throw new Error("Service unavailable"); },
  });
  assert.equal(result.imdbRating, 8.7);
});

test("preserves only unambiguous previous IMDb ratings", () => {
  const movie = { id: "new", title: "Film", releaseYear: "2026" };
  const previous = { ...movie, id: "old", imdbId: "tt1234", imdbRating: 8, imdbVotes: 100 };
  assert.equal(preserveMovieRatings([movie], [previous])[0].imdbRating, 8);
  assert.deepEqual(preserveMovieRatings([{ id: "unknown", title: "Film" }], [
    previous, { ...previous, id: "other", imdbId: "tt5678", imdbRating: 7 },
  ]), [{ id: "unknown", title: "Film" }]);
});

test("refreshes legacy cache, preserves details offline and clears unavailable refreshed values", async () => {
  const path = await cachePath();
  const movie = { id: "example", title: "Example Film", imdbId: details.imdbID };
  const options = { apiKey: "test", cachePath: path, now: new Date("2026-09-09T10:00:00Z") };
  await enrichMoviesWithOmdb([movie], { ...options, request: async () => details });
  const cache = JSON.parse(await readFile(path, "utf8"));
  delete cache.entries.example.detailsVersion;
  await writeFile(path, JSON.stringify(cache));
  let calls = 0;
  const [enriched] = await enrichMoviesWithOmdb([movie], {
    ...options, request: async () => { calls += 1; return details; },
  });
  assert.equal(calls, 1);
  assert.equal(enriched.oscarWins, 4);
  assert.equal(enriched.metascore, 82);
  assert.equal(enriched.rottenTomatoesRating, 93);
  assert.equal(enriched.boxOfficeUsd, 123456789);
  assert.equal(preserveMovieRatings([movie], [enriched])[0].oscarWins, 4);
  const [offline] = await enrichMoviesWithOmdb([movie], { ...options, apiKey: undefined });
  assert.equal(offline.boxOfficeUsd, enriched.boxOfficeUsd);
  const [stale] = await enrichMoviesWithOmdb([movie], {
    ...options, now: new Date("2026-09-11T10:00:00Z"), request: async () => { throw new Error("offline"); },
  });
  assert.equal(stale.oscarWins, 4);
  const [refreshed] = await enrichMoviesWithOmdb([enriched], {
    ...options, now: new Date("2026-09-11T10:00:00Z"),
    request: async () => ({ ...details, Awards: "Nominated for 1 Oscar.", Metascore: "N/A", Ratings: [], BoxOffice: "N/A" }),
  });
  assert.equal(refreshed.oscarWins, 0);
  assert.equal(refreshed.metascore, null);
  assert.equal(refreshed.rottenTomatoesRating, null);
  assert.equal(refreshed.boxOfficeUsd, null);
});

test("keeps negative OMDb lookups cached after the details upgrade", async () => {
  const options = { apiKey: "test", cachePath: await cachePath(), now: new Date("2026-09-09T10:00:00Z") };
  const movie = { id: "unknown", title: "Unknown", imdbId: "tt9999999" };
  let calls = 0;
  const request = async () => { calls += 1; return { Response: "False", Error: "Movie not found!" }; };
  await enrichMoviesWithOmdb([movie], { ...options, request });
  await enrichMoviesWithOmdb([movie], { ...options, request });
  assert.equal(calls, 1);
});
