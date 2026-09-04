import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const MATCHED_TTL_MS = 20 * 60 * 60 * 1000;
const UNMATCHED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function readCache(cachePath) {
  try {
    const cache = JSON.parse(await readFile(cachePath, "utf8"));
    return cache?.version === 4 && cache.entries ? cache : { version: 4, entries: {} };
  } catch (error) {
    if (error.code === "ENOENT") return { version: 4, entries: {} };
    console.warn(`OMDb cache could not be read: ${error.message}`);
    return { version: 4, entries: {} };
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

async function wikidataRequest(parameters) {
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.search = new URLSearchParams({ format: "json", origin: "*", ...parameters });
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "doKina.sk schedule aggregator (+https://github.com/)",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Wikidata returned ${response.status} ${response.statusText}`);
  return response.json();
}

function comparableTitle(value = "") {
  return value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("sk")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function claimValue(entity, property) {
  return (entity?.claims?.[property] || [])
    .map((claim) => claim?.mainsnak?.datavalue?.value)
    .filter(Boolean);
}

async function resolveWikidataImdbId(movie, request) {
  const expectedTitle = comparableTitle(movie.title);
  const expectedYear = Number(movie.releaseYear) || null;

  for (const language of ["sk", "cs"]) {
    const searchPayload = await request({
      action: "wbsearchentities",
      search: movie.title,
      language,
      type: "item",
      limit: "8",
    });
    if (searchPayload?.error) throw new Error(`Wikidata: ${searchPayload.error.info || searchPayload.error.code}`);
    const ids = (searchPayload?.search || [])
      .filter((result) => comparableTitle(result.match?.text || result.label) === expectedTitle)
      .map((result) => result.id);
    if (ids.length === 0) continue;

    const entitiesPayload = await request({
      action: "wbgetentities",
      ids: ids.join("|"),
      props: "claims",
    });
    if (entitiesPayload?.error) throw new Error(`Wikidata: ${entitiesPayload.error.info || entitiesPayload.error.code}`);
    const candidates = Object.values(entitiesPayload?.entities || {}).flatMap((entity) => {
      const imdbIds = claimValue(entity, "P345").filter((value) => /^tt\d+$/.test(value));
      const years = claimValue(entity, "P577").map((value) => Number(String(value.time || "").slice(1, 5))).filter(Number.isFinite);
      if (expectedYear && (years.length === 0 || !years.some((year) => Math.abs(year - expectedYear) <= 1))) return [];
      return imdbIds;
    });
    const unique = [...new Set(candidates)];
    if (unique.length === 1) return unique[0];
  }
  return null;
}

async function fetchEntry(movie, previous, apiKey, request, wikiRequest, fetchedAt) {
  if (previous?.imdbId) {
    const payload = await request({ i: previous.imdbId }, apiKey);
    assertServiceAvailable(payload);
    const entry = normalizedResult(payload, fetchedAt);
    if (entry.imdbId) return entry;
  }

  const titles = [...new Set([movie.englishTitle, movie.originalTitle, movie.title].filter(Boolean))];
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

  const wikidataImdbId = await resolveWikidataImdbId(movie, wikiRequest);
  if (wikidataImdbId) {
    const payload = await request({ i: wikidataImdbId }, apiKey);
    assertServiceAvailable(payload);
    return normalizedResult(payload, fetchedAt);
  }
  return { fetchedAt };
}

export async function enrichMoviesWithOmdb(movies, options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) return movies;

  const cachePath = options.cachePath || ".cache/omdb.json";
  const request = options.request || omdbRequest;
  const wikiRequest = options.wikidataRequest || wikidataRequest;
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
        cache.entries[movie.id] = await fetchEntry(movie, previous, apiKey, request, wikiRequest, fetchedAt);
      } catch (error) {
        console.warn(`OMDb enrichment failed for “${movie.title}”: ${error.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(5, movies.length) }, worker));
  await writeCache(cachePath, cache);
  return movies.map((movie) => applyEntry(movie, cache.entries[movie.id]));
}
