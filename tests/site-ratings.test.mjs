import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("movie detail shows the shared ratings immediately after the trailer", async () => {
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");

  assert.match(html, /id="movie-dialog-trailer"[\s\S]*?<\/a>\s*<div[\s\S]*?id="movie-dialog-ratings"/);
  assert.match(source, /renderMovieRatings\(movie, elements\.dialogRatings\);/);
  assert.match(source, /renderMovieRatings\(movie, ratingsElement\);/);
});
