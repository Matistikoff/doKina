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

test("tries a first-party English title before localized and original titles", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dokina-omdb-"));
  const requests = [];
  const movies = [{
    id: "movie-nedosiahnutelna-laska-2018",
    title: "Nedosiahnuteľná láska",
    englishTitle: "An Impossible Love",
    originalTitle: "Un Amour Impossible",
    releaseYear: 2018,
  }];
  await enrichMoviesWithOmdb(movies, {
    apiKey: "test",
    cachePath: join(directory, "omdb.json"),
    request: async (parameters) => {
      requests.push(parameters);
      return { Response: "True", imdbID: "tt8260226", imdbRating: "7.0", imdbVotes: "1,000" };
    },
    now: new Date("2026-09-04T10:00:00.000Z"),
  });

  assert.deepEqual(requests, [{ t: "An Impossible Love", type: "movie", y: "2018" }]);
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

test("resolves an exact localized title through Wikidata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dokina-omdb-"));
  const cachePath = join(directory, "omdb.json");
  const movies = [{ id: "movie-auta-2006", title: "Autá", releaseYear: "2006" }];
  const request = async (parameters) => {
    if (parameters.t) return { Response: "False", Error: "Movie not found!" };
    assert.equal(parameters.i, "tt0317219");
    return { Response: "True", imdbID: "tt0317219", imdbRating: "7.3", imdbVotes: "510,000" };
  };
  const wikidataRequest = async (parameters) => {
    if (parameters.action === "wbsearchentities") {
      return { search: [{ id: "Q182153", match: { text: "Autá" } }] };
    }
    return {
      entities: {
        Q182153: {
          claims: {
            P345: [{ mainsnak: { datavalue: { value: "tt0317219" } } }],
            P577: [{ mainsnak: { datavalue: { value: { time: "+2006-06-09T00:00:00Z" } } } }],
          },
        },
      },
    };
  };

  const enriched = await enrichMoviesWithOmdb(movies, {
    apiKey: "test",
    cachePath,
    request,
    wikidataRequest,
    now: new Date("2026-09-04T10:00:00.000Z"),
  });

  assert.equal(enriched[0].imdbId, "tt0317219");
  assert.equal(enriched[0].imdbRating, 7.3);
});
