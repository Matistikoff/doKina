import assert from "node:assert/strict";
import test from "node:test";

import { alternativeMovieTitle } from "../site/movie-title.js";

test("hides an alternative title that only differs in case or punctuation", () => {
  assert.equal(alternativeMovieTitle({
    title: "MILOVNÍK, NIE BOJOVNÍK",
    originalTitle: "Milovník, nie bojovník",
  }), null);
  assert.equal(alternativeMovieTitle({
    title: "Film – príbeh",
    originalTitle: "film: príbeh",
  }), null);
});

test("keeps a genuinely different original title", () => {
  assert.equal(alternativeMovieTitle({
    title: "Odyssea",
    originalTitle: "The Odyssey",
  }), "The Odyssey");
});

test("uses a distinct English title when the original title duplicates the main title", () => {
  assert.equal(alternativeMovieTitle({
    title: "PARAZIT",
    originalTitle: "Parazit",
    englishTitle: "Parasite",
  }), "Parasite");
});
