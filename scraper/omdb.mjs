import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { moviesMatch } from "./deduplicate.mjs";
import { lookupTitles, normalizeTitle } from "./tmdb.mjs";

const MATCHED_TTL_MS = 20 * 60 * 60 * 1000;
const UNMATCHED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function readCache(cachePath) {
  try {
    const cache = JSON.parse(await readFile(cachePath, "utf8"));
    return cache?.version === 1 && cache.entries ? cache : { version: 1, entries: {} };
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return { version: 1, entries: {} };
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
  if (!entry?.imdbId || (movie.imdbId && movie.imdbId !== entry.imdbId)) return movie;
  return {
    ...movie,
    imdbId: entry.imdbId,
    ...(Number.isFinite(entry.imdbRating) ? { imdbRating: entry.imdbRating } : {}),
    ...(Number.isInteger(entry.imdbVotes) ? { imdbVotes: entry.imdbVotes } : {}),
  };
}

function normalizedResult(payload, fetchedAt) {
  if (payload?.Response !== "True" || !/^tt\d+$/.test(payload.imdbID || "")) return { fetchedAt };
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
  if (payload?.Response !== "False" || /not found|incorrect imdb id/i.test(payload.Error || "")) return;
  throw new Error(payload.Error || "unexpected response");
}

async function omdbRequest(parameters, apiKey) {
  const url = new URL("https://www.omdbapi.com/");
  url.search = new URLSearchParams({ apikey: apiKey, ...parameters });
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`OMDb returned ${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchEntry(movie, request, apiKey, fetchedAt) {
  if (movie.imdbId) {
    const payload = await request({ i: movie.imdbId }, apiKey);
    assertServiceAvailable(payload);
    return normalizedResult(payload, fetchedAt);
  }
  const titles = lookupTitles(movie);
  for (const title of titles) {
    const payload = await request({
      t: title,
      type: "movie",
      ...(movie.releaseYear ? { y: String(movie.releaseYear) } : {}),
    }, apiKey);
    assertServiceAvailable(payload);
    if (payload.Response !== "True") continue;
    if (payload.Title && !titles.map(normalizeTitle).includes(normalizeTitle(payload.Title))) continue;
    if (movie.releaseYear && payload.Year && Number.parseInt(payload.Year, 10) !== Number(movie.releaseYear)) continue;
    return normalizedResult(payload, fetchedAt);
  }
  return { fetchedAt };
}

export function preserveMovieRatings(movies, previousMovies) {
  return movies.map((movie) => {
    const candidates = previousMovies.filter((previous) => previous.imdbId && moviesMatch(movie, previous));
    if (new Set(candidates.map((previous) => previous.imdbId)).size !== 1) return movie;
    return applyEntry(movie, candidates.find((candidate) => candidate.id === movie.id) || candidates[0]);
  });
}

export async function enrichMoviesWithOmdb(movies, options = {}) {
  const apiKey = options.apiKey;
  const cachePath = options.cachePath || ".cache/omdb.json";
  const request = options.request || omdbRequest;
  const now = options.now || new Date();
  const cache = await readCache(cachePath);
  movies = preserveMovieRatings(movies, options.previousMovies || []);
  const lookupKey = (movie) => JSON.stringify(["omdb-rating-v1", movie.imdbId,
    lookupTitles(movie), movie.releaseYear]);
  if (!apiKey) {
    console.warn("OMDB_API_KEY is not set; using saved IMDb ratings without refreshing them.");
    return movies.map((movie) => {
      const entry = cache.entries[movie.id];
      return applyEntry(movie, entry?.lookupKey === lookupKey(movie) ? entry : null);
    });
  }
  let cursor = 0;
  async function worker() {
    while (cursor < movies.length) {
      const movie = movies[cursor];
      cursor += 1;
      const previous = cache.entries[movie.id];
      const currentLookupKey = lookupKey(movie);
      if (previous?.lookupKey === currentLookupKey && isFresh(previous, now)) continue;
      try {
        cache.entries[movie.id] = {
          ...await fetchEntry(movie, request, apiKey, now.toISOString()),
          lookupKey: currentLookupKey,
        };
      } catch (error) {
        console.warn(`OMDb rating failed for “${movie.title}”: ${error.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, movies.length) }, worker));
  await writeCache(cachePath, cache);
  return movies.map((movie) => {
    const entry = cache.entries[movie.id];
    return applyEntry(movie, entry?.lookupKey === lookupKey(movie) ? entry : null);
  });
}
