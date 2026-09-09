import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("movie detail and cards render production countries as accessible flags", async () => {
  const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
  const renderer = source.match(/function renderDialogMovieMeta\([\s\S]*?\n\}\n/u)?.[0];

  assert.ok(renderer, "dialog metadata renderer should exist");
  assert.match(renderer, /movie\.releaseYear[\s\S]*items\.push\(alternativeTitle\)[\s\S]*productionCountriesElement\(movie\)/u);
  assert.match(source, /function productionCountriesElement\(movie\)/u);
  assert.match(source, /countryFlag\(code\)/u);
  assert.match(source, /countryName\(code\)/u);
  assert.match(source, /country\.setAttribute\("aria-label", name\)/u);
  assert.match(source, /const meta = fragment\.querySelector\("\.movie-meta"\)[\s\S]*meta\.append\(meta\.textContent \? " · " : "", countries\)/u);
  assert.doesNotMatch(source, /movie-secondary-title|secondaryMovieTitle/u);
});
