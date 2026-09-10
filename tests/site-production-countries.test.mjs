import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("movie detail and cards render production countries as accessible flags", async () => {
  const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
  const renderer = source.match(/function renderDialogMovieMeta\([\s\S]*?\n\}\n/u)?.[0];

  assert.ok(renderer, "dialog metadata renderer should exist");
  assert.match(renderer, /const alternativeTitle = alternativeMovieTitle\(movie\)[\s\S]*movie\.releaseYear[\s\S]*productionCountriesElement\(movie\)/u);
  assert.match(renderer, /titleRow\.className = "dialog-original-title"[\s\S]*detailsRow\.className = "dialog-movie-details"/u);
  assert.match(source, /function productionCountriesElement\(movie\)/u);
  assert.match(source, /countryFlagPath\(code\)/u);
  assert.match(source, /countryName\(code\)/u);
  assert.match(source, /image\.src = flagPath/u);
  assert.match(source, /image\.addEventListener\("error"[\s\S]*countryFlag\(code\)/u);
  assert.match(source, /country\.setAttribute\("aria-label", name\)/u);
  assert.match(source, /const meta = fragment\.querySelector\("\.movie-meta"\)[\s\S]*detailsRow\.append\(details \? " · " : "", countries\)/u);
  assert.doesNotMatch(source, /movie-secondary-title|secondaryMovieTitle/u);
});

test("production-country flags use compact one-em width", async () => {
  const styles = await readFile(new URL("../site/styles.css", import.meta.url), "utf8");

  assert.match(styles, /\.production-country img \{[\s\S]*?width: 1em;/u);
});
