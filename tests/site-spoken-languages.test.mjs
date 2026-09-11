import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("movie detail and cards render spoken languages as accessible flags", async () => {
  const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
  const renderer = source.match(/function renderDialogMovieMeta\([\s\S]*?\n\}\n/u)?.[0];

  assert.ok(renderer, "dialog metadata renderer should exist");
  assert.match(renderer, /const alternativeTitle = alternativeMovieTitle\(movie\)[\s\S]*movie\.releaseYear[\s\S]*spokenLanguagesElement\(movie, screenings\)/u);
  assert.match(renderer, /titleRow\.className = "dialog-original-title"[\s\S]*detailsRow\.className = "dialog-movie-details"/u);
  assert.match(source, /function spokenLanguagesElement\(movie, screenings = \[\]\)/u);
  assert.match(source, /movie\.spokenLanguages\?\.length \? movie\.spokenLanguages : screeningLanguages/u);
  assert.match(source, /countryFlagPath\(flagCountry\)/u);
  assert.match(source, /languageName\(code\)/u);
  assert.match(source, /image\.src = flagPath/u);
  assert.match(source, /image\.addEventListener\("error"[\s\S]*countryFlag\(flagCountry\)/u);
  assert.match(source, /language\.setAttribute\("aria-label", name\)/u);
  assert.match(source, /const meta = fragment\.querySelector\("\.movie-meta"\)[\s\S]*detailsRow\.append\(details \? " · " : "", languages\)/u);
  assert.doesNotMatch(source, /movie-secondary-title|secondaryMovieTitle/u);
});

test("spoken-language flags use compact 0.8-em width", async () => {
  const styles = await readFile(new URL("../site/styles.css", import.meta.url), "utf8");

  assert.match(styles, /\.spoken-language img \{[\s\S]*?width: 0\.8em;/u);
});
