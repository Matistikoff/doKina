import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("discovery dropdown includes a non-English movie filter", async () => {
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");

  assert.match(html, /<option value="nonEnglish">Neanglické filmy<\/option>/u);
  assert.match(source, /state\.sortBy !== "nonEnglish" \|\| isNonEnglishMovie\(movie, screening\)/u);
  assert.match(source, /"nonEnglish"/u);
});
