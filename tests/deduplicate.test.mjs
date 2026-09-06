import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { deduplicateMovies } from "../scraper/deduplicate.mjs";

function program(movies) {
  return { movies, screenings: movies.map((movie, index) => ({
    id: `screening-${index}`, movieId: movie.id, cinemaId: `cinema-${index}`,
    startsAt: "2026-09-06T18:00:00+02:00", bookingUrl: `https://example.com/${index}`,
  })) };
}

test("merges the three Odyssey variants and preserves all screening details", () => {
  const input = program([
    { id: "movie-odysea-2026", title: "Odysea", originalTitle: "The Odyssey", releaseYear: "2026", directors: ["Christopher Nolan"], durationMinutes: 172, posterUrl: "poster.jpg" },
    { id: "movie-odyssea", title: "ODYSSEA", originalTitle: "The Odyssey", releaseYear: null, durationMinutes: 172, genres: ["Dráma"] },
    { id: "movie-odyssea-2026", title: "ODYSSEA", releaseYear: "2026", durationMinutes: 172 },
  ]);
  const before = structuredClone(input);
  const result = deduplicateMovies(input);
  assert.equal(result.movies.length, 1);
  assert.equal(result.movies[0].id, "movie-odysea-2026");
  assert.deepEqual(result.movies[0].genres, ["Dráma"]);
  assert.deepEqual(result.screenings, input.screenings.map((s) => ({ ...s, movieId: "movie-odysea-2026" })));
  assert.deepEqual(input, before);
  assert.deepEqual(deduplicateMovies(result), result);
  assert.deepEqual(deduplicateMovies({ ...input, movies: [...input.movies].reverse() }), result);
});

test("normalizes casing, accents, punctuation and known screening suffixes", () => {
  const result = deduplicateMovies(program([
    { id: "a", title: "Čierny dážď" },
    { id: "b", title: "CIERNY   DAZD [ST]" },
    { id: "c", title: "Čierny dážď!" },
  ]));
  assert.equal(result.movies.length, 1);
});

test("matches translated titles and shared IMDb IDs", () => {
  assert.equal(deduplicateMovies(program([
    { id: "a", title: "Lokálny názov", originalTitle: "Original title" },
    { id: "b", title: "Original title" },
  ])).movies.length, 1);
  assert.equal(deduplicateMovies(program([
    { id: "a", title: "Prvý názov", imdbId: "tt1234" },
    { id: "b", title: "Iný názov", imdbId: "tt1234" },
  ])).movies.length, 1);
});

test("normalizes and merges genre synonyms", () => {
  const result = deduplicateMovies(program([
    { id: "a", title: "Film", releaseYear: "2026", genres: ["Dokument", "sport"] },
    { id: "b", title: "Film", releaseYear: "2026", genres: ["Dokumentárny", "Športový"] },
  ]));
  assert.deepEqual(result.movies[0].genres, ["Dokumentárny", "Športový"]);
});

test("does not merge conflicting identities or unsupported typos", () => {
  const base = { id: "a", title: "Odyssea", releaseYear: "2026", durationMinutes: 172, directors: ["Christopher Nolan"], imdbId: "tt1234" };
  for (const change of [
    { releaseYear: "1997" }, { imdbId: "tt5678" }, { directors: ["Other Director"] },
    { durationMinutes: 100 }, { title: "Odyssea 2" },
  ]) {
    assert.equal(deduplicateMovies(program([base, { ...base, imdbId: null, ...change, id: "b" }])).movies.length, 2);
  }
  assert.equal(deduplicateMovies(program([
    { id: "a", title: "Odysea" }, { id: "b", title: "Odyssea" },
  ])).movies.length, 2);
});

test("an unknown year does not bridge two remakes", () => {
  const result = deduplicateMovies(program([
    { id: "a", title: "Film", releaseYear: "1990" },
    { id: "b", title: "Film" },
    { id: "c", title: "Film", releaseYear: "2026" },
  ]));
  assert.equal(result.movies.length, 3);
});

test("current programme keeps every screening and has one Odyssey", async () => {
  const input = JSON.parse(await readFile(new URL("../site/program.json", import.meta.url), "utf8"));
  const result = deduplicateMovies(input);
  assert.equal(result.screenings.length, input.screenings.length);
  assert.deepEqual(result.screenings.map(({ movieId, ...screening }) => screening),
    input.screenings.map(({ movieId, ...screening }) => screening));
  const odyssey = result.movies.filter((movie) => /^odys?sea$/iu.test(movie.title));
  // The live programme can eventually stop including this film.
  assert.ok(odyssey.length <= 1);
});
