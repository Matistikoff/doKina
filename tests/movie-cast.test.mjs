import test from "node:test";
import assert from "node:assert/strict";
import { limitedMovieCast, MAX_CAST_MEMBERS } from "../site/movie-cast.js";

test("deduplicates actors and limits the movie detail to six names", () => {
  const actors = [
    "Adam Kubala",
    "Michaela Kostková",
    "František Beleš",
    "Jaroslav Vojtek",
    "Marián Mitaš",
    "Simona Lewandowská",
    "Adam Kubala",
    "Michaela Kostková",
    "Siedmy Herec",
  ];

  assert.deepEqual(limitedMovieCast({ actors }).names, actors.slice(0, MAX_CAST_MEMBERS));
});

test("deduplicates and limits cast cards while preserving the first credit", () => {
  const cast = [
    { name: "Herec 1", character: "Prvá postava" },
    { name: " Herec 1 ", character: "Duplicitná postava" },
    ...Array.from({ length: 7 }, (_, index) => ({ name: `Herec ${index + 2}` })),
  ];

  const result = limitedMovieCast({ cast });

  assert.equal(result.cast.length, MAX_CAST_MEMBERS);
  assert.deepEqual(result.cast[0], { name: "Herec 1", character: "Prvá postava" });
  assert.deepEqual(result.names, result.cast.map((person) => person.name));
});
