import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("movie cards show the alternative title before the director", async () => {
  const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
  const formatter = source.match(/function movieMeta\(movie,[\s\S]*?\n\}/u)?.[0];

  assert.ok(formatter, "movieMeta should exist");
  assert.ok(formatter.indexOf("alternativeMovieTitle") < formatter.indexOf("movie.directors"));
  assert.doesNotMatch(formatter, /Réžia:/u);
  assert.match(formatter, /movie\.directors\.slice\(0, 2\)\.join\(", "\)/u);
  assert.match(formatter, /filter\(Boolean\)\.join\("\\n"\)/u);
  assert.match(source, /titleRow\.className = "movie-original-title"[\s\S]*movieMeta\(movie, \{ includeAlternativeTitle: false \}\)[\s\S]*detailsRow\.className = "movie-details"/u);
  assert.match(source, /directors\.append\("Réžia: "\)/u);
});

test("movie card metadata can wrap without hiding language flags", async () => {
  const styles = await readFile(new URL("../site/styles.css", import.meta.url), "utf8");

  assert.doesNotMatch(styles, /\.movie-card \.movie-meta \{[\s\S]*?-webkit-line-clamp/u);
  assert.match(styles, /\.movie-card \{[\s\S]*?height: auto;[\s\S]*?min-height: 18\.75rem;/u);
  assert.match(styles, /\.movie-meta \{[\s\S]*?margin-top: 0;[\s\S]*?\}/u);
  assert.match(styles, /\.movie-details,[\s\S]*?\.dialog-movie-details \{[\s\S]*?margin-top: 8px;[\s\S]*?\}/u);
});
