import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("middle-clicking a movie card opens its detail in a new tab", async () => {
  const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");

  assert.match(source, /card\.addEventListener\("auxclick", \(event\) => \{[\s\S]*?event\.button !== 1[\s\S]*?event\.preventDefault\(\);[\s\S]*?window\.open\(movieDetailUrl\(movie\.id, window\.location\.href\), "_blank", "noopener"\);[\s\S]*?\}\);/u);
});
