import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { enrichMoviesWithOmdb } from "../scraper/omdb.mjs";

test("enriches a movie with its IMDb rating and caches the result", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dokina-omdb-"));
  const cachePath = join(directory, "omdb.json");
  const requests = [];
  const request = async (parameters) => {
    requests.push(parameters);
    return { Response: "True", imdbID: "tt0133093", imdbRating: "8.7", imdbVotes: "2,100,000" };
  };
  const movies = [{ id: "movie-matrix-1999", title: "Matrix", originalTitle: "The Matrix", releaseYear: 1999 }];
  const now = new Date("2026-09-04T10:00:00.000Z");

  const enriched = await enrichMoviesWithOmdb(movies, { apiKey: "test", cachePath, request, now });
  const cached = JSON.parse(await readFile(cachePath, "utf8"));

  assert.deepEqual(requests, [{ t: "The Matrix", type: "movie", y: "1999" }]);
  assert.equal(enriched[0].imdbId, "tt0133093");
  assert.equal(enriched[0].imdbRating, 8.7);
  assert.equal(enriched[0].imdbVotes, 2_100_000);
  assert.equal(cached.entries["movie-matrix-1999"].imdbId, "tt0133093");
});

test("uses a fresh cached result without making another request", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dokina-omdb-"));
  const cachePath = join(directory, "omdb.json");
  const movies = [{ id: "movie-matrix-1999", title: "Matrix", releaseYear: 1999 }];
  const request = async () => ({ Response: "True", imdbID: "tt0133093", imdbRating: "8.7", imdbVotes: "100" });

  await enrichMoviesWithOmdb(movies, { apiKey: "test", cachePath, request, now: new Date("2026-09-04T10:00:00.000Z") });
  const enriched = await enrichMoviesWithOmdb(movies, {
    apiKey: "test",
    cachePath,
    request: async () => { throw new Error("request should not run"); },
    now: new Date("2026-09-04T12:00:00.000Z"),
  });

  assert.equal(enriched[0].imdbRating, 8.7);
});

test("keeps a stale cached rating when the OMDb quota is unavailable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dokina-omdb-"));
  const cachePath = join(directory, "omdb.json");
  const movies = [{ id: "movie-matrix-1999", title: "Matrix", releaseYear: 1999 }];
  const initialRequest = async () => ({ Response: "True", imdbID: "tt0133093", imdbRating: "8.7", imdbVotes: "100" });
  await enrichMoviesWithOmdb(movies, { apiKey: "test", cachePath, request: initialRequest, now: new Date("2026-09-04T10:00:00.000Z") });

  const enriched = await enrichMoviesWithOmdb(movies, {
    apiKey: "test",
    cachePath,
    request: async () => ({ Response: "False", Error: "Request limit reached!" }),
    now: new Date("2026-09-06T10:00:00.000Z"),
  });

  assert.equal(enriched[0].imdbId, "tt0133093");
  assert.equal(enriched[0].imdbRating, 8.7);
});
