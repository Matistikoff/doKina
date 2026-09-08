import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { enrichMoviesWithCsfd, resolveCsfdMovie } from "../scraper/csfd.mjs";
import { compareMovies } from "../scraper/deduplicate.mjs";

const detail = JSON.parse(await readFile(new URL("./fixtures/csfd-movie.json", import.meta.url), "utf8"));
const movie = { id: "plums", title: "Pět švestek", releaseYear: "2026", directors: ["Jan Svěrák"], durationMinutes: 100 };
const client = (details = [detail]) => ({
  search: async () => ({ movies: details }),
  movie: async (id) => details.find((item) => item.id === id),
});
const cachePath = async () => join(await mkdtemp(join(tmpdir(), "dokina-csfd-")), "cache.json");

test("ČSFD resolves a verified movie and carries alternate titles into IMDb lookup", async () => {
  const result = await resolveCsfdMovie(movie, client());
  assert.equal(result.csfdRating, 71);
  assert.equal(result.csfdVotes, 717);
  assert.ok(result.alternativeTitles.includes("Five Plums"));
  assert.equal((await resolveCsfdMovie({ ...movie, title: "Five Plums" }, client())).csfdId, detail.id);
});

test("ČSFD rejects conflicting metadata, title-only matches, TV and ambiguous remakes", async () => {
  for (const change of [{ title: "Pět švestek 2" }, { releaseYear: "2023" },
    { directors: ["Someone Else"] }, { durationMinutes: 130 }, { releaseYear: null, directors: [] }]) {
    assert.equal(await resolveCsfdMovie({ ...movie, ...change }, client()), null);
  }
  assert.equal(await resolveCsfdMovie(movie, client([{ ...detail, type: "tv-series" }])), null);
  assert.equal(await resolveCsfdMovie(movie, client([detail, { ...detail, id: 123 }])), null);
  assert.equal(await resolveCsfdMovie(movie, { search: async () => ({ movies: Array(20).fill(detail) }) }), null);
  assert.equal(compareMovies({ ...movie, csfdId: 1 }, { ...movie, csfdId: 2 }).matches, false);
});

test("ČSFD accepts a zero score but keeps unavailable scores absent", async () => {
  assert.equal((await resolveCsfdMovie(movie, client([{ ...detail, rating: 0 }]))).csfdRating, 0);
  assert.equal((await resolveCsfdMovie(movie, client([{ ...detail, rating: null }]))).csfdRating, null);
});

test("ČSFD uses cache and retains ratings on outage or when disabled", async () => {
  const path = await cachePath();
  const options = { cachePath: path, now: new Date("2026-09-01"), client: client() };
  await enrichMoviesWithCsfd([movie], options);
  const offline = { search: async () => { throw new Error("Offline"); }, movie: async () => { throw new Error("Offline"); } };
  const [fresh] = await enrichMoviesWithCsfd([movie], { ...options, client: offline });
  assert.equal(fresh.csfdRating, 71);
  const [stale] = await enrichMoviesWithCsfd([movie], { ...options, now: new Date("2026-09-03"), client: offline });
  assert.equal(stale.csfdRating, 71);
  const [disabled] = await enrichMoviesWithCsfd([movie], { ...options, enabled: false, client: offline });
  assert.equal(disabled.csfdRating, 71);
  const [wrong] = await enrichMoviesWithCsfd([{ ...movie, releaseYear: "2000" }], { ...options, enabled: false });
  assert.equal(wrong.csfdRating, undefined);
});

test("ČSFD stops after three consecutive service failures", async () => {
  let calls = 0;
  const result = await enrichMoviesWithCsfd(Array.from({ length: 6 }, (_, id) => ({ ...movie, id: String(id) })), {
    cachePath: await cachePath(), client: { search: async () => { calls += 1; throw new Error("Offline"); } },
  });
  assert.equal(calls, 3);
  assert.equal(result.length, 6);
});
