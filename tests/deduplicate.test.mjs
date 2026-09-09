import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { auditMovieDuplicates, compareMovies, deduplicateMovies } from "../scraper/deduplicate.mjs";

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

test("merges comma-separated directors with individual names and preserves screenings", () => {
  const input = program([
    { id: "movie-zapas-storocia", title: "Zápas storočia", releaseYear: "2026", durationMinutes: 91,
      directors: ["Juan Cabral, Santiago Franco"], imdbId: "tt41593328" },
    { id: "movie-zapas-storocia-2026", title: "Zápas storočia", releaseYear: "2026", durationMinutes: 91,
      directors: ["Juan Cabral", "Santiago Franco"], csfdId: 1848384 },
  ]);
  const result = deduplicateMovies(input);
  assert.equal(result.movies.length, 1);
  assert.equal(result.movies[0].imdbId, "tt41593328");
  assert.equal(result.movies[0].csfdId, 1848384);
  assert.deepEqual(result.movies[0].directors, ["Juan Cabral", "Santiago Franco"]);
  assert.deepEqual(result.screenings, input.screenings.map((screening) => ({ ...screening, movieId: result.movies[0].id })));
  assert.deepEqual(deduplicateMovies(result), result);
  assert.deepEqual(deduplicateMovies({ ...input, movies: [...input.movies].reverse() }), result);
  assert.equal(compareMovies(input.movies[0], { ...input.movies[1], directors: ["Another Director"] }).matches, false);
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
  assert.ok(auditMovieDuplicates(program([
    { id: "a", title: "Film", releaseYear: "1990" },
    { id: "b", title: "Film" },
    { id: "c", title: "Film", releaseYear: "2026" },
  ])).every((finding) => finding.status === "review"));
});

test("I Swear production/premiere years merge with all five screenings intact", async () => {
  const input = JSON.parse(await readFile(new URL("./fixtures/i-swear-duplicates.json", import.meta.url), "utf8"));
  const before = structuredClone(input);
  const result = deduplicateMovies(input);
  assert.equal(result.movies.length, 1);
  assert.equal(result.movies[0].title, "Prisahám, že za to nemôžem");
  assert.equal(result.movies[0].releaseYear, "2025");
  assert.equal(result.movies[0].imdbId, "tt31514146");
  assert.equal(result.movies[0].ageRating, "15");
  assert.equal(result.screenings.length, 5);
  assert.deepEqual(result.screenings, input.screenings.map((screening) => ({ ...screening, movieId: result.movies[0].id })));
  assert.deepEqual(input, before);
  assert.deepEqual(deduplicateMovies(result), result);
  assert.deepEqual(deduplicateMovies({ ...input, movies: [...input.movies].reverse() }), result);
  const findings = auditMovieDuplicates(input);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].status, "merge");
  assert.equal(findings[0].reason, "title-director-duration-premiere-year");
  assert.equal(findings[0].canonicalId, result.movies[0].id);
  assert.deepEqual(auditMovieDuplicates(result), []);
});

test("one-year tolerance requires exact title, director and close runtime", () => {
  const a = { id: "a", title: "Čierny dážď", releaseYear: "2025", directors: ["Ján Novák"], durationMinutes: 120 };
  const b = { ...a, id: "b", title: "CIERNY DAZD", releaseYear: 2026, directors: ["Jan Novak"], durationMinutes: 122 };
  assert.equal(compareMovies(a, b).matches, true);
  for (const change of [
    { directors: [] }, { directors: ["Someone Else"] }, { durationMinutes: null },
    { durationMinutes: 123 }, { releaseYear: "2027" }, { title: "Čierny daždík" },
  ]) {
    assert.equal(compareMovies(a, { ...b, ...change }).matches, false, JSON.stringify(change));
  }
  for (const key of ["imdbId", "tmdbId"]) {
    const comparison = compareMovies({ ...a, [key]: key === "tmdbId" ? 1 : "tt1" },
      { ...b, [key]: key === "tmdbId" ? 2 : "tt2" });
    assert.equal(comparison.matches, false);
    assert.ok(comparison.conflicts.includes(key));
  }
});

test("shared TMDb IDs match alternate titles but do not override conflicting metadata", () => {
  const a = { id: "a", title: "Prvý názov", tmdbId: 123 };
  const b = { id: "b", title: "Iný názov", tmdbId: 123 };
  assert.equal(deduplicateMovies(program([a, b])).movies.length, 1);
  assert.equal(compareMovies(a, b).reason, "shared-tmdb");
  assert.equal(compareMovies({ ...a, imdbId: "tt1" }, { ...b, imdbId: "tt2" }).matches, false);
});

test("audit explains blocked candidates and ignores unrelated films", () => {
  const input = program([
    { id: "a", title: "Film", releaseYear: "2025", directors: ["A"], durationMinutes: 100 },
    { id: "b", title: "FILM", releaseYear: "2026", directors: ["B"], durationMinutes: 120 },
    { id: "c", title: "Unrelated" },
  ]);
  const [finding] = auditMovieDuplicates(input);
  assert.equal(auditMovieDuplicates(input).length, 1);
  assert.equal(finding.status, "review");
  assert.deepEqual(finding.conflicts, ["releaseYear", "directors", "durationMinutes"]);
  assert.equal(finding.reviewReason, "conflicting-metadata");
  assert.deepEqual(auditMovieDuplicates({ ...input, movies: [...input.movies].reverse() }), [finding]);
});

test("a chain of premiere years cannot bridge a two-year conflict", () => {
  const input = program([2024, 2025, 2026].map((year) => ({
    id: String(year), title: "Film", releaseYear: String(year), directors: ["Director"], durationMinutes: 120,
  })));
  assert.equal(deduplicateMovies(input).movies.length, 2);
  const finding = auditMovieDuplicates(input).find((item) => item.movieIds.join() === "2025,2026");
  assert.equal(finding.status, "review");
  assert.equal(finding.reviewReason, "ambiguous-group");
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
