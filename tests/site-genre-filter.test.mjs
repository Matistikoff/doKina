import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { matchesSelectedGenres } from "../site/filters.js";

test("genre matching supports any and all selected genres", () => {
  const movieGenres = ["Komédia", "Hudobný"];

  assert.equal(matchesSelectedGenres(movieGenres, new Set(["Komédia", "Dráma"]), "any"), true);
  assert.equal(matchesSelectedGenres(movieGenres, new Set(["Komédia", "Hudobný"]), "all"), true);
  assert.equal(matchesSelectedGenres(movieGenres, new Set(["Komédia", "Dráma"]), "all"), false);
  assert.equal(matchesSelectedGenres(movieGenres, new Set(), "any"), false);
});

test("genre dropdown exposes an accessible all-genres switch", async () => {
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../site/app.js", import.meta.url), "utf8");

  assert.match(html, /id="genre-match-all"[\s\S]*?role="switch"[\s\S]*?Vyžadovať zhodu so všetkými vybranými žánrami/u);
  assert.match(app, /genreMatchMode: "any"/u);
  assert.match(app, /matchesSelectedGenres\(movie\.genres, state\.selectedGenres, state\.genreMatchMode\)/u);
});
