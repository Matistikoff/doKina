import assert from "node:assert/strict";
import test from "node:test";
import { applyMovieHistory } from "../scraper/movie-history.mjs";

test("marks an unseen movie with the current scrape time", () => {
  const generatedAt = "2026-09-08T10:00:00.000Z";
  const result = applyMovieHistory([
    { id: "movie-new-2026", title: "Nový film", releaseYear: "2026" },
  ], { generatedAt, history: { version: 1, movies: [] } });

  assert.equal(result.movies[0].firstSeenAt, generatedAt);
  assert.equal(result.history.movies[0].firstSeenAt, generatedAt);
});

test("keeps the first sighting when a known movie returns with a different source id", () => {
  const result = applyMovieHistory([
    { id: "source-b-42", title: "Známy film", releaseYear: "2024", imdbId: "tt1234567" },
  ], {
    generatedAt: "2026-09-08T10:00:00.000Z",
    history: {
      version: 1,
      movies: [{ id: "source-a-12", title: "Známy film", releaseYear: "2024", imdbId: "tt1234567", firstSeenAt: "2026-08-30T10:00:00.000Z" }],
    },
  });

  assert.equal(result.movies[0].firstSeenAt, "2026-08-30T10:00:00.000Z");
  assert.equal(result.history.movies.length, 1);
});

test("uses the checked-in previous programme to bootstrap an empty cache", () => {
  const result = applyMovieHistory([
    { id: "movie-a", title: "Film A", releaseYear: "2025" },
    { id: "movie-b", title: "Film B", releaseYear: "2026" },
  ], {
    generatedAt: "2026-09-08T10:00:00.000Z",
    previousGeneratedAt: "2026-09-01T10:00:00.000Z",
    previousMovies: [{ id: "movie-a", title: "Film A", releaseYear: "2025" }],
    history: { version: 1, movies: [] },
  });

  assert.deepEqual(result.movies.map((movie) => movie.firstSeenAt), [
    "2026-09-01T10:00:00.000Z",
    "2026-09-08T10:00:00.000Z",
  ]);
});
