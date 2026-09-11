import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("movie detail links underlined director names to Google search", async () => {
  const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../site/styles.css", import.meta.url), "utf8");
  const renderer = source.match(/function renderDialogMovieMeta\(movie, screenings\) \{[\s\S]*?\n\}/)?.[0];

  assert.ok(renderer, "renderDialogMovieMeta should exist");
  assert.match(renderer, /link\.href = directorSearchUrl\(name\)/);
  assert.match(renderer, /link\.target = "_blank"/);
  assert.match(renderer, /link\.className = "dialog-director-link"/);
  assert.match(styles, /\.dialog-director-link \{[\s\S]*?color: var\(--accent-deep\);[\s\S]*?text-decoration: underline;/);
});
