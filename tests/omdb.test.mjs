import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { enrichMoviesWithOmdb, preserveMovieRatings } from "../scraper/omdb.mjs";

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
