import assert from "node:assert/strict";
import test from "node:test";
import {
  actorSearchUrl,
  directorSearchUrl,
  metacriticMovieUrl,
  movieDetailUrl,
  rottenTomatoesMovieUrl,
} from "../site/links.js";

test("builds an encoded Google search URL for an actor", () => {
  const url = new URL(actorSearchUrl("Zoë Saldaña & Co."));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/search");
  assert.equal(url.searchParams.get("q"), "Zoë Saldaña & Co.");
});

test("builds an encoded Google search URL for a director", () => {
  const url = new URL(directorSearchUrl("Kirk Jones"));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/search");
  assert.equal(url.searchParams.get("q"), "Kirk Jones");
});

test("builds a shareable movie detail URL", () => {
  const url = new URL(movieDetailUrl("film id/2026", "https://dokina.sk/?kino=klap#program"));

  assert.equal(url.pathname, "/film/film%20id%2F2026");
  assert.equal(url.search, "?kino=klap");
  assert.equal(url.hash, "");
});

test("builds exact critic links from Wikidata identifiers", () => {
  const movie = {
    rottenTomatoesId: "m/the_godfather",
    metacriticId: "movie/the-godfather",
  };
  assert.equal(rottenTomatoesMovieUrl(movie), "https://www.rottentomatoes.com/m/the_godfather");
  assert.equal(metacriticMovieUrl(movie), "https://www.metacritic.com/movie/the-godfather/");
});

test("falls back to critic searches using the English title and year", () => {
  const movie = { title: "Krstný otec", englishTitle: "The Godfather", releaseYear: "1972" };
  const tomatoes = new URL(rottenTomatoesMovieUrl(movie));
  assert.equal(tomatoes.origin, "https://www.rottentomatoes.com");
  assert.equal(tomatoes.pathname, "/search/");
  assert.equal(tomatoes.searchParams.get("search"), "The Godfather 1972");
  assert.equal(metacriticMovieUrl(movie), "https://www.metacritic.com/search/The%20Godfather%201972/");
});
