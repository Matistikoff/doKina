import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { csfd } from "node-csfd-api";
import { lookupTitles, normalizeTitle } from "./tmdb.mjs";
import { moviesMatch } from "./deduplicate.mjs";

const DAY_MS = 86_400_000;

export function createCsfdClient() {
  let lastRequest = 0;
  async function request(method, value) {
    await delay(Math.max(0, 700 - (Date.now() - lastRequest)));
    lastRequest = Date.now();
    return csfd[method](value, { language: "sk", request: { signal: AbortSignal.timeout(15_000) } });
  }
  return { search: (title) => request("search", title), movie: (id) => request("movie", id) };
}

export async function resolveCsfdMovie(movie, client) {
  const titles = lookupTitles(movie);
  const expected = titles.map(normalizeTitle);
  const year = Number(movie.releaseYear) || null;
  const directors = (movie.directors || []).map(normalizeTitle);
  // A translated title alone cannot establish identity.
  if (!year && !directors.length) return null;
  const candidates = new Map();
  if (movie.csfdId) candidates.set(movie.csfdId, { id: movie.csfdId });
  else for (const title of titles) {
    const result = await client.search(title);
    if (!Array.isArray(result?.movies)) throw new Error("Invalid ČSFD search response");
    // Broad searches may be truncated by the source; do not pick their first hit.
    if (result.movies.length >= 20) return null;
    for (const item of result.movies) {
      if (year && Number(item.year) && Math.abs(year - Number(item.year)) > 1) continue;
      if (Number.isInteger(item.id) && item.id > 0) candidates.set(item.id, item);
    }
  }
  if (candidates.size > 20) return null;
  const matches = [];
  for (const { id } of candidates.values()) {
    const detail = await client.movie(id);
    if (detail?.id !== id) throw new Error("Invalid ČSFD movie response");
    if (detail.type !== "film") continue;
    const names = [detail.title, ...(detail.titlesOther || []).map((item) => item.title)].filter(Boolean);
    if (!names.some((name) => expected.includes(normalizeTitle(name)))) continue;
    const actualDirectors = (detail.creators?.directors || []).map((person) => normalizeTitle(person.name));
    const sameDirector = directors.some((name) => actualDirectors.includes(name));
    if (directors.length && !sameDirector) continue;
    if (year && (!Number(detail.year) || Math.abs(year - Number(detail.year)) > 1)) continue;
    if (year && year !== Number(detail.year) && !sameDirector) continue;
    const duration = Number(detail.duration);
    if (movie.durationMinutes && duration && Math.abs(movie.durationMinutes - duration) > 10) continue;
    matches.push({
      csfdId: id,
      csfdRating: Number.isFinite(detail.rating) && detail.rating >= 0 && detail.rating <= 100 ? detail.rating : null,
      csfdVotes: Number.isInteger(detail.ratingCount) && detail.ratingCount >= 0 ? detail.ratingCount : null,
      alternativeTitles: [...new Set(names)],
    });
  }
  return matches.length === 1 ? matches[0] : null;
}

function applyEntry(movie, entry) {
  if (!entry?.csfdId || (movie.csfdId && movie.csfdId !== entry.csfdId)) return movie;
  return { ...movie, csfdId: entry.csfdId,
    ...(Number.isFinite(entry.csfdRating) ? { csfdRating: entry.csfdRating } : {}),
    ...(Number.isInteger(entry.csfdVotes) ? { csfdVotes: entry.csfdVotes } : {}),
    alternativeTitles: [...new Set([...(movie.alternativeTitles || []), ...(entry.alternativeTitles || [])])],
  };
}

export async function enrichMoviesWithCsfd(movies, options = {}) {
  const cachePath = options.cachePath || ".cache/csfd.json";
  const now = options.now || new Date();
  const client = options.client || createCsfdClient();
  let cache = { version: 1, entries: {} };
  try {
    const saved = JSON.parse(await readFile(cachePath, "utf8"));
    if (saved.version === 1 && saved.entries) cache = saved;
  } catch (error) {
    if (error.code !== "ENOENT") console.warn("ČSFD cache could not be read; starting a new cache.");
  }
  let failures = 0;
  const result = [];
  for (let movie of movies) {
    const previous = (options.previousMovies || []).filter((item) => item.csfdId && moviesMatch(movie, item));
    if (new Set(previous.map((item) => item.csfdId)).size === 1) movie = applyEntry(movie, previous[0]);
    // Exclude aliases supplied by this cache from its own identity key.
    const lookupKey = JSON.stringify([movie.title, movie.originalTitle, movie.englishTitle,
      movie.releaseYear, movie.directors, movie.durationMinutes, movie.imdbId]);
    const saved = cache.entries[movie.id];
    const entry = saved?.lookupKey === lookupKey ? saved : null;
    movie = applyEntry(movie, entry);
    const age = now.getTime() - Date.parse(entry?.fetchedAt);
    const fresh = age >= 0 && age < (entry?.csfdId ? DAY_MS : 7 * DAY_MS);
    if (!fresh && failures < 3 && options.enabled !== false) {
      try {
        const metadata = await resolveCsfdMovie(movie, client);
        cache.entries[movie.id] = { ...(metadata || {}), lookupKey, fetchedAt: now.toISOString() };
        movie = applyEntry(movie, metadata);
        failures = 0;
      } catch {
        failures += 1;
        console.warn(`ČSFD lookup failed for “${movie.title}”; keeping saved data.${failures === 3 ? " Skipping ČSFD for the rest of this run." : ""}`);
      }
    }
    result.push(movie);
  }
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  return result;
}
