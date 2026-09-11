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

test("schema validates optional OMDb scores and TMDb worldwide gross", () => {
  const base = assembleProgram([], "2026-09-09T10:00:00Z");
  const movie = { id: "film", title: "Film", oscarWins: 4, metascore: 0, rottenTomatoesRating: 100, budgetUsd: 50000000, worldwideGrossUsd: 123456789 };
  assert.doesNotThrow(() => validateProgram({ ...base, movies: [movie] }));
  for (const [key, value] of [["oscarWins", -1], ["metascore", 101], ["rottenTomatoesRating", 1.5], ["budgetUsd", "N/A"], ["worldwideGrossUsd", "N/A"]]) {
    assert.throws(() => validateProgram({ ...base, movies: [{ ...movie, [key]: value }] }), new RegExp(`invalid ${key}`));
  }
});

test("schema validates optional critic site identifiers", () => {
  const base = assembleProgram([], "2026-09-09T10:00:00Z");
  const movie = { id: "film", title: "Film", rottenTomatoesId: "m/example_film", metacriticId: "movie/example-film" };
  assert.doesNotThrow(() => validateProgram({ ...base, movies: [movie] }));
  for (const [key, value] of [["rottenTomatoesId", "tv/example"], ["metacriticId", "game/example"]]) {
    assert.throws(() => validateProgram({ ...base, movies: [{ ...movie, [key]: value }] }), new RegExp(`invalid ${key}`));
  }
});

test("schema validation accepts ISO production countries and rejects invalid codes", () => {
  const base = {
    schemaVersion: 1,
    generatedAt: "2026-09-04T10:00:00.000Z",
    timezone: "Europe/Bratislava",
    sources: [{}, {}],
    cinemas: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    screenings: [],
  };
  assert.doesNotThrow(() => validateProgram({ ...base, movies: [{ id: "film", title: "Film", productionCountries: ["SK", "CZ"] }] }));
  assert.throws(() => validateProgram({ ...base, movies: [{ id: "film", title: "Film", productionCountries: ["Slovakia"] }] }), /invalid productionCountries/);
});

test("schema validation accepts an ISO original language", () => {
  const base = assembleProgram([], "2026-09-09T10:00:00Z");
  assert.doesNotThrow(() => validateProgram({ ...base, movies: [{ id: "film", title: "Film", originalLanguage: "sk" }] }));
  assert.throws(() => validateProgram({ ...base, movies: [{ id: "film", title: "Film", originalLanguage: "eng" }] }), /invalid originalLanguage/);
  assert.doesNotThrow(() => validateProgram({ ...base, movies: [{ id: "film", title: "Film", spokenLanguages: ["sk", "en"] }] }));
  assert.throws(() => validateProgram({ ...base, movies: [{ id: "film", title: "Film", spokenLanguages: ["slk"] }] }), /invalid spokenLanguages/);
});

test("schema validation accepts trusted TMDB backdrop and YouTube trailer URLs", () => {
  const base = {
    schemaVersion: 1,
    generatedAt: "2026-09-04T10:00:00.000Z",
    timezone: "Europe/Bratislava",
    sources: [{}, {}],
    cinemas: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    screenings: [],
  };
  assert.doesNotThrow(() => validateProgram({ ...base, movies: [{ id: "film", title: "Film",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/image.jpg",
    trailerUrl: "https://www.youtube.com/watch?v=abcdefghijk" }] }));
  assert.throws(() => validateProgram({ ...base, movies: [{ id: "film", title: "Film",
    trailerUrl: "javascript:alert(1)" }] }), /invalid trailerUrl/);
});

test("schema validation accepts only trusted TMDB cast portraits", () => {
  const base = assembleProgram([], "2026-09-09T10:00:00Z");
  const movie = { id: "film", title: "Film", cast: [{
    name: "Herečka", character: "Postava", profileUrl: "https://image.tmdb.org/t/p/w185/profile.jpg",
  }] };
  assert.doesNotThrow(() => validateProgram({ ...base, movies: [movie] }));
  assert.throws(() => validateProgram({ ...base, movies: [{ ...movie, cast: [{
    name: "Herec", profileUrl: "https://example.com/profile.jpg",
  }] }] }), /invalid cast/);
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
