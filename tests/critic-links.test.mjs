import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  enrichMoviesWithCriticLinks,
  parseWikidataCriticLinks,
  preserveCriticLinkIds,
} from "../scraper/critic-links.mjs";

const payload = {
  results: {
    bindings: [{
      imdbId: { value: "tt0068646" },
      rottenTomatoesId: { value: "m/the_godfather" },
      metacriticId: { value: "movie/the-godfather" },
    }],
  },
};

async function cachePath() {
  return join(await mkdtemp(join(tmpdir(), "dokina-critic-links-")), "critic-links.json");
}

test("parses valid film identifiers from a Wikidata SPARQL response", () => {
  assert.deepEqual(parseWikidataCriticLinks(payload).get("tt0068646"), {
    rottenTomatoesId: "m/the_godfather",
    metacriticId: "movie/the-godfather",
  });
  const invalid = parseWikidataCriticLinks({ results: { bindings: [{
    imdbId: { value: "tt1234" },
    rottenTomatoesId: { value: "tv/example" },
    metacriticId: { value: "game/example" },
  }] } });
  assert.deepEqual(invalid.get("tt1234"), {});
});

test("enriches rated films in one batch and reuses the cache", async () => {
  const requests = [];
  const options = {
    cachePath: await cachePath(),
    now: new Date("2026-09-10T10:00:00Z"),
    request: async (imdbIds) => { requests.push(imdbIds); return payload; },
  };
  const movie = {
    id: "godfather", title: "The Godfather", releaseYear: "1972",
    imdbId: "tt0068646", metascore: 100, rottenTomatoesRating: 97,
  };
  const [enriched] = await enrichMoviesWithCriticLinks([movie], options);
  assert.deepEqual(requests, [["tt0068646"]]);
  assert.equal(enriched.rottenTomatoesId, "m/the_godfather");
  assert.equal(enriched.metacriticId, "movie/the-godfather");
  await enrichMoviesWithCriticLinks([movie], options);
  assert.equal(requests.length, 1);
});

test("preserves unambiguous critic identifiers from the previous programme", () => {
  const movie = { id: "new", title: "Film", releaseYear: "2026", imdbId: "tt1234" };
  const previous = {
    ...movie, id: "old", rottenTomatoesId: "m/film", metacriticId: "movie/film",
  };
  assert.deepEqual(preserveCriticLinkIds([movie], [previous])[0], {
    ...movie, rottenTomatoesId: "m/film", metacriticId: "movie/film",
  });
  assert.equal(preserveCriticLinkIds([movie], [previous, {
    ...previous, id: "other", rottenTomatoesId: "m/other-film",
  }])[0].rottenTomatoesId, undefined);
});

test("keeps previous identifiers when Wikidata is unavailable", async () => {
  const movie = {
    id: "film", title: "Film", releaseYear: "2026", imdbId: "tt1234", metascore: 80,
  };
  const [result] = await enrichMoviesWithCriticLinks([movie], {
    cachePath: await cachePath(),
    previousMovies: [{ ...movie, rottenTomatoesId: "m/film", metacriticId: "movie/film" }],
    request: async () => { throw new Error("offline"); },
  });
  assert.equal(result.rottenTomatoesId, "m/film");
  assert.equal(result.metacriticId, "movie/film");
});
