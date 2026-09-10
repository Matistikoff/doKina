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

test("critic scores are external links with accessible labels", async () => {
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");

  assert.match(html, /<a id="movie-dialog-tomatoes"[^>]*target="_blank"[^>]*rel="noreferrer"/u);
  assert.match(html, /<a id="movie-dialog-metascore"[^>]*target="_blank"[^>]*rel="noreferrer"/u);
  assert.match(source, /meta\.href = metacriticMovieUrl\(movie\);/u);
  assert.match(source, /tomatoes\.href = rottenTomatoesMovieUrl\(movie\);/u);
  assert.match(source, /meta\.setAttribute\("aria-label", meta\.title\);/u);
  assert.match(source, /tomatoes\.setAttribute\("aria-label", tomatoes\.title\);/u);
});
