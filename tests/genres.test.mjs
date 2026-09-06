import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGenre, normalizeGenres } from "../scraper/genres.mjs";

test("normalizes genre aliases and technical identifiers to Slovak labels", () => {
  assert.equal(normalizeGenre("zaner_pasmo_kratkych_filmov"), "Pásmo krátkych filmov");
  assert.equal(normalizeGenre("sport"), "Športový");
  assert.equal(normalizeGenre("romance"), "Romantický");
  assert.equal(normalizeGenre("Documentary"), "Dokumentárny");
});

test("deduplicates synonyms after normalization", () => {
  assert.deepEqual(normalizeGenres([
    "Dokument",
    "Dokumentárny",
    " documentary ",
    "Športový",
    "sport",
  ]), ["Dokumentárny", "Športový"]);
});

test("keeps an unknown clean genre instead of discarding it", () => {
  assert.deepEqual(normalizeGenres(["  Experimentálny  ", ""]), ["Experimentálny"]);
});
