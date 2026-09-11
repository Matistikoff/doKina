import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("upcoming films render in a separate section and do not enter programme counts", async () => {
  const [html, source] = await Promise.all([
    readFile(new URL("../site/index.html", import.meta.url), "utf8"),
    readFile(new URL("../site/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /id="upcoming"[\s\S]*?<h2 id="upcoming-heading">Očakávame<\/h2>[\s\S]*?id="upcoming-grid"/u);
  assert.match(source, /function renderUpcomingMovies\(\)[\s\S]*?state\.program\.upcomingMovies \|\| \[\]/u);
  const programmeRenderer = source.match(/function renderProgram\(\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(programmeRenderer);
  assert.doesNotMatch(programmeRenderer, /upcomingMovies/u);
  assert.match(source, /favoriteButton\.hidden = upcoming/u);
  assert.match(source, /movie\.releaseRegion === "worldwide" \? `Vo svete od/u);
});
