import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const MATCHED_TTL_MS = 20 * 60 * 60 * 1000;
const UNMATCHED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function readCache(cachePath) {
  try {
    const cache = JSON.parse(await readFile(cachePath, "utf8"));
    return cache?.version === 1 && cache.entries ? cache : { version: 1, entries: {} };
  } catch (error) {
    if (error.code === "ENOENT") return { version: 1, entries: {} };
    console.warn(`OMDb cache could not be read: ${error.message}`);
    return { version: 1, entries: {} };
  }
}

async function writeCache(cachePath, cache) {
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

function isFresh(entry, now) {
  if (!entry?.fetchedAt) return false;
  const age = now.getTime() - Date.parse(entry.fetchedAt);
  const ttl = entry.imdbId ? MATCHED_TTL_MS : UNMATCHED_TTL_MS;
  return Number.isFinite(age) && age >= 0 && age < ttl;
}

function applyEntry(movie, entry) {
  if (!entry?.imdbId) return movie;
  return {
    ...movie,
    imdbId: entry.imdbId,
    imdbRating: entry.imdbRating,
    imdbVotes: entry.imdbVotes,
  };
}

function normalizedResult(payload, fetchedAt) {
  if (payload?.Response !== "True" || !/^tt\d+$/.test(payload.imdbID || "")) {
    return { fetchedAt };
  }
  const rating = Number.parseFloat(payload.imdbRating);
  const votes = Number.parseInt(String(payload.imdbVotes || "").replaceAll(",", ""), 10);
  return {
    imdbId: payload.imdbID,
    imdbRating: Number.isFinite(rating) ? rating : null,
    imdbVotes: Number.isFinite(votes) ? votes : null,
    fetchedAt,
  };
}

function assertServiceAvailable(payload) {
  if (payload?.Response !== "False") return;
  if (/not found|incorrect imdb id/i.test(payload.Error || "")) return;
  throw new Error(payload.Error || "unexpected response");
}

async function omdbRequest(parameters, apiKey) {
  const url = new URL("https://www.omdbapi.com/");
  url.search = new URLSearchParams({ apikey: apiKey, ...parameters });
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "doKina.sk schedule aggregator (+https://github.com/)",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`OMDb returned ${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchEntry(movie, previous, apiKey, request, fetchedAt) {
  if (previous?.imdbId) {
    const payload = await request({ i: previous.imdbId }, apiKey);
    assertServiceAvailable(payload);
    const entry = normalizedResult(payload, fetchedAt);
    if (entry.imdbId) return entry;
  }

  const titles = [...new Set([movie.originalTitle, movie.title].filter(Boolean))];
  for (const title of titles) {
    const payload = await request({
      t: title,
      type: "movie",
      ...(movie.releaseYear ? { y: String(movie.releaseYear) } : {}),
    }, apiKey);
    assertServiceAvailable(payload);
    const entry = normalizedResult(payload, fetchedAt);
    if (entry.imdbId) return entry;
  }
  return { fetchedAt };
}

export async function enrichMoviesWithOmdb(movies, options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) return movies;

  const cachePath = options.cachePath || ".cache/omdb.json";
  const request = options.request || omdbRequest;
  const now = options.now || new Date();
  const fetchedAt = now.toISOString();
  const cache = await readCache(cachePath);
  let cursor = 0;

  async function worker() {
    while (cursor < movies.length) {
      const movie = movies[cursor];
      cursor += 1;
      const previous = cache.entries[movie.id];
      if (isFresh(previous, now)) continue;
      try {
        cache.entries[movie.id] = await fetchEntry(movie, previous, apiKey, request, fetchedAt);
      } catch (error) {
        console.warn(`OMDb enrichment failed for “${movie.title}”: ${error.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(5, movies.length) }, worker));
  await writeCache(cachePath, cache);
  return movies.map((movie) => applyEntry(movie, cache.entries[movie.id]));
}
