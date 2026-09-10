import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { moviesMatch } from "./deduplicate.mjs";

const MATCHED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const UNMATCHED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 50;

export const isRottenTomatoesId = (value) => typeof value === "string"
  && /^m\/[0-9A-Za-z_][-0-9A-Za-z_'.]*$/u.test(value);

export const isMetacriticId = (value) => typeof value === "string"
  && /^movie\/[-a-z0-9!+_()]+$/u.test(value);

export function parseWikidataCriticLinks(payload) {
  const candidates = new Map();
  for (const binding of payload?.results?.bindings || []) {
    const imdbId = binding.imdbId?.value;
    if (!/^tt\d+$/u.test(imdbId || "")) continue;
    if (!candidates.has(imdbId)) candidates.set(imdbId, { rottenTomatoesIds: new Set(), metacriticIds: new Set() });
    const entry = candidates.get(imdbId);
    if (isRottenTomatoesId(binding.rottenTomatoesId?.value)) entry.rottenTomatoesIds.add(binding.rottenTomatoesId.value);
    if (isMetacriticId(binding.metacriticId?.value)) entry.metacriticIds.add(binding.metacriticId.value);
  }
  return new Map([...candidates].map(([imdbId, entry]) => [imdbId, {
    ...(entry.rottenTomatoesIds.size === 1 ? { rottenTomatoesId: [...entry.rottenTomatoesIds][0] } : {}),
    ...(entry.metacriticIds.size === 1 ? { metacriticId: [...entry.metacriticIds][0] } : {}),
  }]));
}

export async function wikidataCriticLinksRequest(imdbIds) {
  const values = imdbIds.map((id) => JSON.stringify(id)).join(" ");
  const query = `SELECT ?imdbId ?rottenTomatoesId ?metacriticId WHERE {
  VALUES ?imdbId { ${values} }
  ?item wdt:P345 ?imdbId.
  OPTIONAL { ?item wdt:P1258 ?rottenTomatoesId. }
  OPTIONAL { ?item wdt:P1712 ?metacriticId. }
}`;
  const response = await fetch("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "doKina.sk/1.0 (https://dokina.sk/)",
    },
    body: new URLSearchParams({ query }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Wikidata returned HTTP ${response.status}`);
  return response.json();
}

async function readCache(cachePath) {
  try {
    const cache = JSON.parse(await readFile(cachePath, "utf8"));
    return cache?.version === 1 && cache.entries ? cache : { version: 1, entries: {} };
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return { version: 1, entries: {} };
    console.warn(`Critic links cache could not be read: ${error.message}`);
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
  const matched = isRottenTomatoesId(entry.rottenTomatoesId) || isMetacriticId(entry.metacriticId);
  const ttl = matched ? MATCHED_TTL_MS : UNMATCHED_TTL_MS;
  return Number.isFinite(age) && age >= 0 && age < ttl;
}

function applyEntry(movie, entry) {
  if (!entry) return movie;
  return {
    ...movie,
    ...(isRottenTomatoesId(entry.rottenTomatoesId) ? { rottenTomatoesId: entry.rottenTomatoesId } : {}),
    ...(isMetacriticId(entry.metacriticId) ? { metacriticId: entry.metacriticId } : {}),
  };
}

export function preserveCriticLinkIds(movies, previousMovies) {
  return movies.map((movie) => {
    const candidates = previousMovies.filter((previous) => moviesMatch(movie, previous)
      && (isRottenTomatoesId(previous.rottenTomatoesId) || isMetacriticId(previous.metacriticId)));
    const rottenTomatoesIds = new Set(candidates.map((candidate) => candidate.rottenTomatoesId)
      .filter(isRottenTomatoesId));
    const metacriticIds = new Set(candidates.map((candidate) => candidate.metacriticId).filter(isMetacriticId));
    return applyEntry(movie, {
      ...(rottenTomatoesIds.size === 1 ? { rottenTomatoesId: [...rottenTomatoesIds][0] } : {}),
      ...(metacriticIds.size === 1 ? { metacriticId: [...metacriticIds][0] } : {}),
    });
  });
}

export async function enrichMoviesWithCriticLinks(movies, options = {}) {
  const cachePath = options.cachePath || ".cache/critic-links.json";
  const request = options.request || wikidataCriticLinksRequest;
  const now = options.now || new Date();
  const cache = await readCache(cachePath);
  movies = preserveCriticLinkIds(movies, options.previousMovies || []);
  const imdbIds = [...new Set(movies.filter((movie) => /^tt\d+$/u.test(movie.imdbId || "")
    && (Number.isFinite(movie.metascore) || Number.isFinite(movie.rottenTomatoesRating)))
    .map((movie) => movie.imdbId))];
  const staleIds = imdbIds.filter((imdbId) => !isFresh(cache.entries[imdbId], now));

  if (options.enabled !== false) {
    for (let index = 0; index < staleIds.length; index += BATCH_SIZE) {
      const batch = staleIds.slice(index, index + BATCH_SIZE);
      try {
        const results = parseWikidataCriticLinks(await request(batch));
        for (const imdbId of batch) {
          cache.entries[imdbId] = { ...(results.get(imdbId) || {}), fetchedAt: now.toISOString() };
        }
      } catch (error) {
        console.warn(`Wikidata critic links failed: ${error.message}`);
      }
    }
    await writeCache(cachePath, cache);
  }

  return movies.map((movie) => applyEntry(movie, cache.entries[movie.imdbId]));
}
