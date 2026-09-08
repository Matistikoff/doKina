import assert from "node:assert/strict";
import test from "node:test";
import { compareMoviesByRating, preferredRating } from "../site/ratings.js";

test("uses the rating with more votes and converts IMDb to percent", () => {
  assert.deepEqual(preferredRating({
    imdbRating: 8.4,
    imdbVotes: 1_001,
    csfdRating: 91,
    csfdVotes: 1_000,
  }), { source: "IMDb", percent: 84, votes: 1_001 });

  assert.deepEqual(preferredRating({
    imdbRating: 8.4,
    imdbVotes: 999,
    csfdRating: 91,
    csfdVotes: 1_000,
  }), { source: "ČSFD", percent: 91, votes: 1_000 });
});

test("uses an available rating and prefers IMDb when vote counts are equal", () => {
  assert.equal(preferredRating({}), null);
  assert.equal(preferredRating({ imdbRating: 7.2 })?.percent, 72);
  assert.equal(preferredRating({ csfdRating: 68 })?.percent, 68);
  assert.equal(preferredRating({ imdbRating: 7.2, csfdRating: 68 })?.source, "IMDb");
});

test("sorts by the selected rating and leaves unrated movies last", () => {
  const movies = [
    { title: "Bez hodnotenia" },
    { title: "IMDb film", imdbRating: 8.4, imdbVotes: 500, csfdRating: 90, csfdVotes: 100 },
    { title: "ČSFD film", imdbRating: 9.5, imdbVotes: 10, csfdRating: 91, csfdVotes: 200 },
  ];

  assert.deepEqual(movies.sort(compareMoviesByRating).map((movie) => movie.title), [
    "ČSFD film",
    "IMDb film",
    "Bez hodnotenia",
  ]);
});
