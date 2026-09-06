import { cleanTitle } from "./utils.mjs";
import { metadataText } from "./movie-metadata.mjs";

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
      language: "sk-SK", append_to_response: "alternative_titles,credits,translations",
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
  // Count matching films even if one has no IMDb ID; do not choose by popularity.
  if (matches.length !== 1) return null;
  const detail = matches[0];
  if (movie.imdbId && Number.isFinite(movie.imdbRating) && detail.imdb_id !== movie.imdbId) return null;
  const translations = detail.translations?.translations || [];
  const overview = ["sk", "cs", "en"].map((language) => ({
    language,
    text: metadataText(translations.find((item) => item.iso_639_1 === language && metadataText(item.data?.overview))?.data.overview)
      || (language === "sk" ? metadataText(detail.overview) : null),
  })).find((item) => item.text);
  return {
    tmdbId: detail.id,
    ...(/^tt\d+$/.test(detail.imdb_id || "") ? { imdbId: detail.imdb_id } : {}),
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
