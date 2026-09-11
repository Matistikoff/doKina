import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("movie detail keeps native wheel scrolling and contains overscroll", async () => {
  const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../site/styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(source, /enhance\(elements\.dialogScroller\)/u);
  assert.match(styles, /\.dialog-content \{\s*scroll-behavior: auto;\s*overscroll-behavior-y: contain;/u);
});
