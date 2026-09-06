import assert from "node:assert/strict";
import test from "node:test";
import { assembleProgram } from "../scraper/index.mjs";
import { validateProgram } from "../scraper/schema.mjs";
import { CINEMAS } from "../scraper/config.mjs";

test("assembles deterministic data and merges matching films", () => {
  const results = [
    { movies: [{ id: "movie-a-2026", title: "A", genres: [], posterUrl: null }], screenings: [{ id: "a-2", movieId: "movie-a-2026", cinemaId: "lumiere", startsAt: "2026-09-05T18:00:00+02:00" }] },
    { movies: [{ id: "movie-a-2026", title: "A", genres: ["Dráma"], posterUrl: "poster.jpg" }], screenings: [{ id: "a-1", movieId: "movie-a-2026", cinemaId: "film-europe", startsAt: "2026-09-04T18:00:00+02:00" }] },
  ];
  const program = assembleProgram(results, "2026-09-04T10:00:00.000Z");
  assert.equal(program.movies.length, 1);
  assert.deepEqual(program.movies[0].genres, ["Dráma"]);
  assert.equal(program.movies[0].posterUrl, "poster.jpg");
  assert.deepEqual(program.screenings.map((item) => item.id), ["a-1", "a-2"]);
  assert.equal(program.sources.length, CINEMAS.length);
});

test("schema validation rejects dangling movie references", () => {
  assert.throws(() => validateProgram({
    schemaVersion: 1,
    generatedAt: "2026-09-04T10:00:00.000Z",
    timezone: "Europe/Bratislava",
    sources: [{}, {}],
    cinemas: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    movies: [],
    screenings: [{ id: "x", movieId: "missing", cinemaId: "a", startsAt: "2026-09-04T18:00:00+02:00" }],
  }), /unknown movieId/);
});

test("assembly remaps different movie IDs to a single film", () => {
  const program = assembleProgram([
    { movies: [{ id: "movie-odysea-2026", title: "Odysea", releaseYear: "2026", durationMinutes: 172 }], screenings: [{ id: "one", movieId: "movie-odysea-2026", cinemaId: "lumiere", startsAt: "2026-09-06T18:00:00+02:00" }] },
    { movies: [{ id: "movie-odyssea-2026", title: "ODYSSEA", releaseYear: "2026", durationMinutes: 172 }], screenings: [{ id: "two", movieId: "movie-odyssea-2026", cinemaId: "film-europe", startsAt: "2026-09-06T19:00:00+02:00" }] },
  ]);
  assert.equal(program.movies.length, 1);
  assert.equal(program.screenings.length, 2);
  assert.ok(program.screenings.every((s) => s.movieId === program.movies[0].id));
});
