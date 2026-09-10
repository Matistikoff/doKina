import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("favorite movies persist locally and can filter the programme", async () => {
  const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");

  assert.match(source, /FAVORITES_STORAGE_KEY = "dokina-favorite-movies"/u);
  assert.match(source, /localStorage\.setItem\(FAVORITES_STORAGE_KEY/u);
  assert.match(source, /!state\.showFavoritesOnly \|\| state\.favoriteMovieIds\.has\(screening\.movieId\)/u);
  assert.match(source, /elements\.favoritesFilterButton\.addEventListener\("click"/u);
  assert.match(source, /if \(state\.showFavoritesOnly\) renderProgram\(\)/u);
});

test("movie cards and filters expose accessible favorite buttons", async () => {
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  const styles = await readFile(new URL("../site/styles.css", import.meta.url), "utf8");

  assert.match(html, /id="favorites-filter-button"[\s\S]*?aria-pressed="false"/u);
  assert.match(html, /class="favorite-button"[\s\S]*?aria-pressed="false"/u);
  assert.match(styles, /\.movie-content \{[\s\S]*?position: relative;/u);
  assert.match(styles, /\.favorite-button \{[\s\S]*?position: absolute;[\s\S]*?right: 10px;/u);
});
