import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("movie detail smooth wheel scrolling settles faster than page scrolling", async () => {
  const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");

  assert.match(source, /const easing = isPage \? 0\.16 : 0\.3;\s*setPosition\(current \+ distance \* easing\);/u);
});
