import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { programPayloads } from "../scripts/program-payloads.mjs";
import { createMovieDetailLoader } from "../site/movie-details.js";

test("lazy payloads reconstruct every movie without changing listings or source data", async () => {
  const program = JSON.parse(await readFile(new URL("../site/program.json", import.meta.url), "utf8"));
  const original = structuredClone(program);
  const { index, details } = programPayloads(program);
  assert.deepEqual(program, original);
  assert.deepEqual(index.screenings, program.screenings);
  assert.deepEqual(index.cinemas, program.cinemas);
  for (const [i, summary] of index.movies.entries()) {
    const { detailDataUrl, ...card } = summary;
    assert.equal(Object.hasOwn(card, "overview"), false);
    assert.equal(Object.hasOwn(card, "cast"), false);
    assert.deepEqual({ ...card, ...JSON.parse(details.get(detailDataUrl)) }, program.movies[i]);
  }
  assert.ok(JSON.stringify(index).length < JSON.stringify(program).length);
});

test("detail URLs change when data changes, not when movies are reordered", () => {
  const movie = { id: "film/ž", title: "Film", overview: "First" };
  const a = programPayloads({ movies: [movie] }).index.movies[0];
  const b = programPayloads({ movies: [{ id: "other" }, movie] }).index.movies[1];
  const c = programPayloads({ movies: [{ ...movie, overview: "New" }] }).index.movies[0];
  assert.equal(a.detailDataUrl, b.detailDataUrl);
  assert.notEqual(a.detailDataUrl, c.detailDataUrl);
  assert.match(a.detailDataUrl, /^\/movie-details\/[a-f0-9]{64}\.json$/u);
});

test("details are fetched on demand and concurrent/repeated opens share a request", async () => {
  let requests = 0;
  const load = createMovieDetailLoader(async () => {
    requests += 1;
    return { ok: true, json: async () => ({ id: "one", overview: "Detail" }) };
  });
  const movie = { id: "one", title: "One", detailDataUrl: "/movie-details/one.json" };
  assert.equal(requests, 0);
  const results = await Promise.all([load(movie), load(movie)]);
  assert.equal(results[0].overview, "Detail");
  assert.equal(results[0].title, "One");
  await load(movie);
  assert.equal(requests, 1);
  assert.equal(await load({ id: "eager" }).then((m) => m.id), "eager");
  assert.equal(requests, 1);
});

test("failed or mismatched detail responses can be retried", async () => {
  let requests = 0;
  const load = createMovieDetailLoader(async () => {
    requests += 1;
    return requests === 1 ? { ok: false, status: 503 }
      : { ok: true, json: async () => ({ id: requests === 2 ? "wrong" : "one" }) };
  });
  const movie = { id: "one", detailDataUrl: "/detail.json" };
  await assert.rejects(load(movie), /503/u);
  await assert.rejects(load(movie), /mismatch/u);
  assert.equal((await load(movie)).id, "one");
  assert.equal(requests, 3);
});
