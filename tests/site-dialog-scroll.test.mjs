import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("movie detail uses native scrolling without a custom scrollbar", async () => {
  const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../site/styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(source, /enhance\(elements\.dialogScroller\)|setupDialogScrollbar/u);
  assert.doesNotMatch(html, /dialog-scrollbar/u);
  assert.match(source, /scroller\.removeEventListener\("wheel", onWheel\)/u);
  assert.match(css, /#movie-dialog \.dialog-content \{\s*scroll-behavior: auto;[\s\S]*?scrollbar-width: auto;\s*scrollbar-color: auto;/u);
});
