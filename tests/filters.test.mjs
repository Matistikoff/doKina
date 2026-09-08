import assert from "node:assert/strict";
import test from "node:test";
import { isCzSkMovie } from "../site/filters.js";

test("recognizes Czech, Slovak and Czechoslovak productions together", () => {
  for (const code of ["CZ", "SK", "CS", "XC"]) {
    assert.equal(isCzSkMovie({ productionCountries: [code] }), true);
  }
  assert.equal(isCzSkMovie({}, { languages: { original: ["cs"] } }), true);
  assert.equal(isCzSkMovie({}, { languages: { original: ["sk"] } }), true);
  assert.equal(isCzSkMovie({ productionCountries: ["FR"] }, { languages: { original: ["cs"] } }), false);
  assert.equal(isCzSkMovie({ productionCountries: ["FR"] }), false);
});
