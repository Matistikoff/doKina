import assert from "node:assert/strict";
import test from "node:test";
import { compareMoviesByDuration, isMustWatch } from "../site/discovery.js";

test("recognizes must-watch films from IMDb rating 8 and above", () => {
  assert.equal(isMustWatch({ imdbRating: 8 }), true);
  assert.equal(isMustWatch({ imdbRating: 8.7 }), true);
  assert.equal(isMustWatch({ imdbRating: 7.9 }), false);
  assert.equal(isMustWatch({ imdbRating: "8.5" }), false);
  assert.equal(isMustWatch({ csfdRating: 95 }), false);
});

test("sorts films by duration in both directions and leaves unknown durations last", () => {
  const movies = [
    { title: "Bez dĺžky", durationMinutes: null },
    { title: "Stredný", durationMinutes: 100 },
    { title: "Krátky", durationMinutes: 70 },
    { title: "Dlhý", durationMinutes: 180 },
  ];

  assert.deepEqual([...movies].sort((a, b) => compareMoviesByDuration(a, b, "shortest")).map((movie) => movie.title), [
    "Krátky",
    "Stredný",
    "Dlhý",
    "Bez dĺžky",
  ]);
  assert.deepEqual([...movies].sort((a, b) => compareMoviesByDuration(a, b, "longest")).map((movie) => movie.title), [
    "Dlhý",
    "Stredný",
    "Krátky",
    "Bez dĺžky",
  ]);
});
