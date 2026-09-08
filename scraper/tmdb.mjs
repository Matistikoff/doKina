import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { moviesMatch } from "./deduplicate.mjs";
import { applyKnownMovieIdentity } from "./movie-identities.mjs";
import { fillMovieMetadata, metadataText } from "./movie-metadata.mjs";
import { cleanTitle } from "./utils.mjs";

const MATCHED_TTL_MS = 20 * 60 * 60 * 1000;
const UNMATCHED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500";

export function lookupTitles(movie) {
  return [...new Set([movie.englishTitle, movie.originalTitle, movie.title]
    .filter(Boolean).map((title) => cleanTitle(title)
      .replace(/\s*\|.*$/u, "")
      .replace(/\s*\+\s*(?:beseda|diskusia|diskusia s|Q&A).*$/iu, "")
      .replace(/^(?:Domáca úroda|UTAJENÉ POKLADY):\s*/iu, "")
      .replace(/^\d+\.\s*VÝROČIE FILMU\s+/iu, "").trim()).filter(Boolean))];
}

export function normalizeTitle(value = "") {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("sk").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export async function tmdbRequest(path, parameters, apiKey) {
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  url.search = new URLSearchParams({ api_key: apiKey, ...parameters });
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  // Never include the request URL (which contains a credential) in errors.
  if (!response.ok) throw new Error(`TMDb returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.success === false) throw new Error("TMDb request failed");
  return payload;
}

function posterUrl(path) {
  return typeof path === "string" && /^\/[\w.-]+$/u.test(path) ? `${POSTER_BASE_URL}${path}` : null;
}

export function selectPoster(detail) {
  const posters = Array.isArray(detail.images?.posters) ? detail.images.posters : [];
  for (const language of ["sk", "cs", null, "en"]) {
    const candidate = posters.filter((poster) => poster.iso_639_1 === language && posterUrl(poster.file_path))
      .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0)
        || (b.vote_average || 0) - (a.vote_average || 0)
        || (b.width || 0) - (a.width || 0))[0];
    if (candidate) return posterUrl(candidate.file_path);
  }
  return posterUrl(detail.poster_path);
}

export async function resolveTmdbMovie(movie, apiKey, request = tmdbRequest) {
  const titles = lookupTitles(movie);
  const expectedTitles = titles.map(normalizeTitle);
  const expectedYear = Number(movie.releaseYear) || null;
  const candidates = new Map();
  for (const query of titles) {
    const payload = await request("search/movie", {
      query, language: "sk-SK", include_adult: "false",
      ...(expectedYear ? { year: String(expectedYear) } : {}),
    }, apiKey);
    if (!Array.isArray(payload.results)) throw new Error("Invalid TMDb search response");
    // A truncated candidate set cannot establish an unambiguous identity.
    if (payload.total_pages > 1) return null;
    for (const candidate of payload.results) {
      const year = Number(String(candidate.release_date || "").slice(0, 4));
      if (expectedYear && (!year || Math.abs(year - expectedYear) > 1)) continue;
      if (Number.isInteger(candidate.id)) candidates.set(candidate.id, candidate);
    }
  }
  if (candidates.size > 20) return null;
  const matches = [];
  for (const candidate of candidates.values()) {
    const detail = await request(`movie/${candidate.id}`, {
      language: "sk-SK",
      append_to_response: "alternative_titles,credits,translations,images",
      include_image_language: "sk,cs,null,en",
    }, apiKey);
    if (detail.id !== candidate.id) throw new Error("Invalid TMDb movie response");
    const names = [candidate.title, candidate.original_title, detail.title, detail.original_title,
      ...(detail.alternative_titles?.titles || []).map((item) => item.title)]
      .filter(Boolean).map(normalizeTitle);
    if (!expectedTitles.some((title) => names.includes(title))) continue;
    const year = Number(String(detail.release_date || "").slice(0, 4));
    if (expectedYear && (!year || Math.abs(year - expectedYear) > 1)) continue;
    const directors = (movie.directors || []).map(normalizeTitle);
    const actualDirectors = (detail.credits?.crew || []).filter((person) => person.job === "Director")
      .map((person) => normalizeTitle(person.name));
    if (directors.length && !directors.some((name) => actualDirectors.includes(name))) continue;
    if (movie.durationMinutes && detail.runtime && Math.abs(movie.durationMinutes - detail.runtime) > 10) continue;
    matches.push(detail);
  }
  // Count matching films even if one is missing some metadata; never choose by popularity.
  if (matches.length !== 1) return null;
  const detail = matches[0];
  if (movie.imdbId && detail.imdb_id && detail.imdb_id !== movie.imdbId) return null;
  const translations = detail.translations?.translations || [];
  const overview = ["sk", "cs", "en"].map((language) => ({
    language,
    text: metadataText(translations.find((item) => item.iso_639_1 === language && metadataText(item.data?.overview))?.data.overview)
      || (language === "sk" ? metadataText(detail.overview) : null),
  })).find((item) => item.text);
  const rating = Number(detail.vote_average);
  const votes = Number(detail.vote_count);
  return {
    tmdbId: detail.id,
    ...(/^tt\d+$/.test(detail.imdb_id || "") ? { imdbId: detail.imdb_id } : {}),
    tmdbRating: Number.isFinite(rating) && rating > 0 ? rating : null,
    tmdbVotes: Number.isInteger(votes) && votes > 0 ? votes : null,
    posterUrl: selectPoster(detail),
    originalTitle: metadataText(detail.original_title),
    releaseYear: /^\d{4}-/.test(detail.release_date || "") ? detail.release_date.slice(0, 4) : null,
    durationMinutes: Number.isInteger(detail.runtime) && detail.runtime > 0 ? detail.runtime : null,
    directors: [...new Set((detail.credits?.crew || []).filter((person) => person.job === "Director")
      .map((person) => metadataText(person.name)).filter(Boolean))],
    ...(overview ? { overview: overview.text, overviewLanguage: overview.language } : {}),
  };
}

export async function resolveTmdbImdbId(movie, apiKey, request = tmdbRequest) {
  return (await resolveTmdbMovie(movie, apiKey, request))?.imdbId || null;
}

async function readCache(cachePath) {
  try {
    const cache = JSON.parse(await readFile(cachePath, "utf8"));
    return cache?.version === 1 && cache.entries ? cache : { version: 1, entries: {} };
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return { version: 1, entries: {} };
    console.warn(`TMDb cache could not be read: ${error.message}`);
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
  const ttl = entry.tmdbId ? MATCHED_TTL_MS : UNMATCHED_TTL_MS;
  return Number.isFinite(age) && age >= 0 && age < ttl;
}

function applyEntry(movie, entry) {
  if (!entry
    || (movie.tmdbId && entry.tmdbId && movie.tmdbId !== entry.tmdbId)
    || (movie.imdbId && entry.imdbId && movie.imdbId !== entry.imdbId)) return movie;
  const enriched = fillMovieMetadata(movie, entry);
  return {
    ...enriched,
    ...(entry.tmdbId ? { tmdbId: entry.tmdbId } : {}),
    ...(entry.imdbId ? { imdbId: entry.imdbId } : {}),
    ...(Number.isFinite(entry.tmdbRating) ? { tmdbRating: entry.tmdbRating } : {}),
    ...(Number.isInteger(entry.tmdbVotes) ? { tmdbVotes: entry.tmdbVotes } : {}),
  };
}

export function preserveTmdbMetadata(movies, previousMovies) {
  return movies.map((movie) => {
    const candidates = previousMovies.filter((previous) => previous.tmdbId && moviesMatch(movie, previous));
    if (new Set(candidates.map((previous) => previous.tmdbId)).size !== 1) return movie;
    return applyEntry(movie, candidates.find((candidate) => candidate.id === movie.id) || candidates[0]);
  });
}

export async function enrichMoviesWithTmdb(movies, options = {}) {
  const apiKey = options.apiKey;
  const cachePath = options.cachePath || ".cache/tmdb.json";
  const request = options.request || tmdbRequest;
  const now = options.now || new Date();
  const cache = await readCache(cachePath);
  movies = preserveTmdbMetadata(movies.map(applyKnownMovieIdentity), options.previousMovies || []);
  const lookupKey = (movie) => JSON.stringify(["tmdb-v1", lookupTitles(movie), movie.releaseYear,
    movie.directors, movie.durationMinutes, movie.imdbId]);
  if (!apiKey) {
    console.warn("TMDB_API_KEY is not set; using saved TMDB metadata without refreshing it.");
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
        const metadata = await resolveTmdbMovie(movie, apiKey, request);
        cache.entries[movie.id] = { ...(metadata || {}), lookupKey: currentLookupKey, fetchedAt: now.toISOString() };
      } catch (error) {
        console.warn(`TMDb enrichment failed for “${movie.title}”: ${error.message}`);
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
