import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("movie cards show the alternative title before the director", async () => {
  const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
  const formatter = source.match(/function movieMeta\(movie,[\s\S]*?\n\}/u)?.[0];

  assert.ok(formatter, "movieMeta should exist");
  assert.ok(formatter.indexOf("alternativeMovieTitle") < formatter.indexOf("movie.directors"));
  assert.match(source, /meta\.textContent = movieMeta\(movie\);/u);
});

test("movie card metadata may use three lines", async () => {
  const styles = await readFile(new URL("../site/styles.css", import.meta.url), "utf8");

  assert.match(styles, /\.movie-card \.movie-meta \{\s*-webkit-line-clamp: 3;\s*\}/u);
});
