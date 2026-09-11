import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("upcoming films are the last discovery option and render in the main grid", async () => {
  const [html, source] = await Promise.all([
    readFile(new URL("../site/index.html", import.meta.url), "utf8"),
    readFile(new URL("../site/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /<option value="soonest">Najbližšie predstavenie<\/option>\s*<option value="upcoming">Očakávame<\/option>/u);
  assert.doesNotMatch(html, /id="upcoming-grid"|id="upcoming-heading"/u);
  assert.match(source, /function renderUpcomingMovies\(cinemaMap\)[\s\S]*?state\.program\.upcomingMovies \|\| \[\][\s\S]*?elements\.movieGrid\.replaceChildren/u);
  assert.match(source, /state\.sortBy === "upcoming"[\s\S]*?renderUpcomingMovies\(cinemaMap\);[\s\S]*?return;/u);
  assert.match(source, /favoriteButton\.hidden = upcoming/u);
  assert.match(source, /movie\.releaseRegion === "worldwide" \? `Vo svete od/u);
});
