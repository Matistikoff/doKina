import assert from "node:assert/strict";
import test from "node:test";
import { isCzSkMovie, isNonEnglishMovie } from "../site/filters.js";

test("recognizes Czech, Slovak and Czechoslovak productions together", () => {
  for (const code of ["CZ", "SK", "CS", "XC"]) {
    assert.equal(isCzSkMovie({ productionCountries: [code] }), true);
  }
  assert.equal(isCzSkMovie({}, { languages: { original: ["cs"] } }), true);
  assert.equal(isCzSkMovie({}, { languages: { original: ["sk"] } }), true);
  assert.equal(isCzSkMovie({ productionCountries: ["FR"] }, { languages: { original: ["cs"] } }), false);
  assert.equal(isCzSkMovie({ productionCountries: ["FR"] }), false);
});

test("recognizes movies whose original language is not English", () => {
  assert.equal(isNonEnglishMovie({ originalLanguage: "ko" }), true);
  assert.equal(isNonEnglishMovie({ originalLanguage: "sk" }), true);
  assert.equal(isNonEnglishMovie({ originalLanguage: "en" }), false);
  assert.equal(isNonEnglishMovie({}, { languages: { original: ["fr"] } }), true);
  assert.equal(isNonEnglishMovie({}, { languages: { original: ["en", "fr"] } }), false);
  assert.equal(isNonEnglishMovie({}), false);
});
