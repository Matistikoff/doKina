import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { moviesMatch } from "./deduplicate.mjs";
import { applyKnownMovieIdentity } from "./movie-identities.mjs";
import { fillMovieMetadata, metadataText } from "./movie-metadata.mjs";
import { cleanTitle } from "./utils.mjs";

const MATCHED_TTL_MS = 20 * 60 * 60 * 1000;
const UNMATCHED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500";
const BACKDROP_BASE_URL = "https://image.tmdb.org/t/p/w1280";
const PROFILE_BASE_URL = "https://image.tmdb.org/t/p/w185";
const MAX_CAST_MEMBERS = 6;
const MAX_UPCOMING_MOVIES = 6;
const UPCOMING_WINDOW_DAYS = 120;

export function lookupTitles(movie) {
  return [...new Set([movie.englishTitle, movie.originalTitle, movie.title, ...(movie.alternativeTitles || [])]
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

function backdropUrl(path) {
  return typeof path === "string" && /^\/[\w.-]+$/u.test(path) ? `${BACKDROP_BASE_URL}${path}` : null;
}

function profileUrl(path) {
  return typeof path === "string" && /^\/[\w.-]+$/u.test(path) ? `${PROFILE_BASE_URL}${path}` : null;
}

export function selectPoster(detail) {
  const posters = Array.isArray(detail.images?.posters) ? detail.images.posters : [];
  for (const language of [null, "sk", "cs", "en"]) {
    const candidate = posters.filter((poster) => poster.iso_639_1 === language && posterUrl(poster.file_path))
      .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0)
        || (b.vote_average || 0) - (a.vote_average || 0)
        || (b.width || 0) - (a.width || 0))[0];
    if (candidate) return posterUrl(candidate.file_path);
  }
  return posterUrl(detail.poster_path);
}

export function selectBackdrop(detail) {
  const backdrops = Array.isArray(detail.images?.backdrops) ? detail.images.backdrops : [];
  for (const language of [null, "sk", "cs", "en"]) {
    const candidate = backdrops.filter((backdrop) => backdrop.iso_639_1 === language && backdropUrl(backdrop.file_path))
      .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0)
        || (b.vote_average || 0) - (a.vote_average || 0)
        || (b.width || 0) - (a.width || 0))[0];
    if (candidate) return backdropUrl(candidate.file_path);
  }
  return backdropUrl(detail.backdrop_path);
}

export function selectTrailer(detail) {
  const languageOrder = ["sk", "cs", "en", null];
  const typeOrder = ["Trailer", "Teaser"];
  const videos = (Array.isArray(detail.videos?.results) ? detail.videos.results : [])
    .filter((video) => video.site === "YouTube" && typeOrder.includes(video.type)
      && /^[\w-]{6,20}$/u.test(video.key || ""));
  const selected = videos.sort((a, b) => {
    const typeA = typeOrder.includes(a.type) ? typeOrder.indexOf(a.type) : typeOrder.length;
    const typeB = typeOrder.includes(b.type) ? typeOrder.indexOf(b.type) : typeOrder.length;
    const languageA = languageOrder.includes(a.iso_639_1) ? languageOrder.indexOf(a.iso_639_1) : languageOrder.length;
    const languageB = languageOrder.includes(b.iso_639_1) ? languageOrder.indexOf(b.iso_639_1) : languageOrder.length;
    return typeA - typeB || Number(Boolean(b.official)) - Number(Boolean(a.official))
      || languageA - languageB || (b.size || 0) - (a.size || 0)
      || String(b.published_at || "").localeCompare(String(a.published_at || ""));
  })[0];
  return selected ? `https://www.youtube.com/watch?v=${selected.key}` : null;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function bratislavaDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function fetchUpcomingMovies(options = {}) {
  const apiKey = options.apiKey;
  const request = options.request || tmdbRequest;
  const now = options.now || new Date();
  const today = bratislavaDate(now);
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + UPCOMING_WINDOW_DAYS);
  const currentTmdbIds = new Set((options.currentMovies || []).map((movie) => movie.tmdbId).filter(Boolean));
  const saved = (options.previousMovies || []).filter((movie) => (
    /^\d{4}-\d{2}-\d{2}$/u.test(movie.releaseDate || "")
    && movie.releaseDate >= today
    && !currentTmdbIds.has(movie.tmdbId)
  )).slice(0, MAX_UPCOMING_MOVIES);

  if (!apiKey) {
    console.warn("TMDB_API_KEY is not set; using saved upcoming movies without refreshing them.");
    return saved;
  }

  try {
    const parameters = {
      include_adult: "false",
      include_video: "false",
      language: "sk-SK",
      page: "1",
      region: "SK",
      sort_by: "popularity.desc",
      with_release_type: "2|3",
      "release_date.gte": today,
      "release_date.lte": isoDate(end),
    };
    const [payload, genrePayload] = await Promise.all([
      request("discover/movie", parameters, apiKey),
      request("genre/movie/list", { language: "sk-SK" }, apiKey),
    ]);
    if (!Array.isArray(payload.results) || !Array.isArray(genrePayload.genres)) {
      throw new Error("Invalid TMDb upcoming response");
    }
    const genres = new Map(genrePayload.genres
      .filter((genre) => Number.isInteger(genre.id) && metadataText(genre.name))
      .map((genre) => [genre.id, metadataText(genre.name)]));
    const seen = new Set();
    return payload.results.filter((movie) => {
      if (!Number.isInteger(movie.id) || seen.has(movie.id) || currentTmdbIds.has(movie.id)) return false;
      if (!metadataText(movie.title) || !posterUrl(movie.poster_path)) return false;
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(movie.release_date || "") || movie.release_date < today) return false;
      seen.add(movie.id);
      return true;
    }).slice(0, MAX_UPCOMING_MOVIES).map((movie) => ({
      id: `upcoming-tmdb-${movie.id}`,
      title: metadataText(movie.title),
      tmdbId: movie.id,
      releaseDate: movie.release_date,
      releaseYear: movie.release_date.slice(0, 4),
      posterUrl: posterUrl(movie.poster_path),
      ...(backdropUrl(movie.backdrop_path) ? { backdropUrl: backdropUrl(movie.backdrop_path) } : {}),
      ...(metadataText(movie.original_title) && movie.original_title !== movie.title
        ? { originalTitle: metadataText(movie.original_title) }
        : {}),
      ...(/^[a-z]{2}$/u.test(movie.original_language || "")
        ? { originalLanguage: movie.original_language }
        : {}),
      ...(metadataText(movie.overview) ? { overview: metadataText(movie.overview), overviewLanguage: "sk" } : {}),
      genres: [...new Set((movie.genre_ids || []).map((id) => genres.get(id)).filter(Boolean))],
    }));
  } catch (error) {
    console.warn(`TMDb upcoming lookup failed: ${error.message}`);
    return saved;
  }
}

export async function resolveTmdbMovie(movie, apiKey, request = tmdbRequest) {
  const titles = lookupTitles(movie);
  const expectedTitles = titles.map(normalizeTitle);
  const expectedYear = Number(movie.releaseYear) || null;
  const candidates = new Map();
  for (const query of titles) {
    let payload = await request("search/movie", {
      query, language: "sk-SK", include_adult: "false",
      ...(expectedYear ? { year: String(expectedYear) } : {}),
    }, apiKey);
    // The cinema's local premiere year can differ from TMDb's production year.
    if (expectedYear && Array.isArray(payload.results) && payload.results.length === 0) {
      payload = await request("search/movie", { query, language: "sk-SK", include_adult: "false" }, apiKey);
    }
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
      append_to_response: "alternative_titles,credits,translations,images,videos",
      include_image_language: "null,sk,cs,en",
    }, apiKey);
    if (detail.id !== candidate.id) throw new Error("Invalid TMDb movie response");
    const names = [candidate.title, candidate.original_title, detail.title, detail.original_title,
      ...(detail.alternative_titles?.titles || []).map((item) => item.title),
      ...(detail.translations?.translations || []).map((item) => item.data?.title)]
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
  let trailerUrl = selectTrailer(detail);
  if (!trailerUrl) {
    try {
      const englishVideos = await request(`movie/${detail.id}/videos`, { language: "en-US" }, apiKey);
      trailerUrl = selectTrailer({ videos: englishVideos });
    } catch (error) {
      console.warn(`TMDb English trailer lookup failed for “${movie.title}”: ${error.message}`);
    }
  }
  const translations = detail.translations?.translations || [];
  const overview = ["sk", "cs", "en"].map((language) => ({
    language,
    text: metadataText(translations.find((item) => item.iso_639_1 === language && metadataText(item.data?.overview))?.data.overview)
      || (language === "sk" ? metadataText(detail.overview) : null),
  })).find((item) => item.text);
  const cast = [];
  const actorNames = new Set();
  for (const person of detail.credits?.cast || []) {
    const name = metadataText(person.name);
    if (!name || actorNames.has(name)) continue;
    actorNames.add(name);
    cast.push({
      name,
      ...(metadataText(person.character) ? { character: metadataText(person.character) } : {}),
      ...(profileUrl(person.profile_path) ? { profileUrl: profileUrl(person.profile_path) } : {}),
    });
    if (cast.length === MAX_CAST_MEMBERS) break;
  }
  const actors = cast.map((person) => person.name);
  const productionCountries = [...new Set((detail.production_countries || [])
    .map((country) => metadataText(country.iso_3166_1)?.toUpperCase()).filter(Boolean))];
  const spokenLanguages = [...new Set((detail.spoken_languages || [])
    .map((language) => metadataText(language.iso_639_1)?.toLowerCase())
    .filter((code) => /^[a-z]{2}$/u.test(code)))];
  return {
    tmdbId: detail.id,
    ...(/^tt\d+$/.test(detail.imdb_id || "") ? { imdbId: detail.imdb_id } : {}),
    ...(Number.isSafeInteger(detail.budget) && detail.budget > 0
      ? { budgetUsd: detail.budget }
      : {}),
    ...(Number.isSafeInteger(detail.revenue) && detail.revenue > 0
      ? { worldwideGrossUsd: detail.revenue }
      : {}),
    posterUrl: selectPoster(detail),
    backdropUrl: selectBackdrop(detail),
    trailerUrl,
    originalTitle: metadataText(detail.original_title),
    originalLanguage: /^[a-z]{2}$/u.test(detail.original_language || "") ? detail.original_language : null,
    ...(spokenLanguages.length ? { spokenLanguages } : {}),
    englishTitle: metadataText(translations.find((item) => item.iso_639_1 === "en")?.data?.title),
    releaseYear: /^\d{4}-/.test(detail.release_date || "") ? detail.release_date.slice(0, 4) : null,
    durationMinutes: Number.isInteger(detail.runtime) && detail.runtime > 0 ? detail.runtime : null,
    directors: [...new Set((detail.credits?.crew || []).filter((person) => person.job === "Director")
      .map((person) => metadataText(person.name)).filter(Boolean))],
    ...(actors.length ? { actors } : {}),
    ...(cast.length ? { cast } : {}),
    ...(productionCountries.length ? { productionCountries } : {}),
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
    ...(entry.posterUrl ? { posterUrl: entry.posterUrl } : {}),
    ...(entry.tmdbId ? { tmdbId: entry.tmdbId } : {}),
    ...(entry.imdbId ? { imdbId: entry.imdbId } : {}),
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
  const lookupKey = (movie) => JSON.stringify(["tmdb-v13", lookupTitles(movie), movie.releaseYear,
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
