import { cleanTitle } from "./utils.mjs";
import { normalizeGenres } from "./genres.mjs";

function normalize(value = "") {
  return cleanTitle(value || "").normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("sk")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function titles(movie) {
  return [...new Set([movie.title, movie.originalTitle, movie.englishTitle].map(normalize).filter(Boolean))];
}

function directors(movie) {
  return (movie.directors || []).flatMap((name) => name.split(/,\s*/u)).map(normalize).filter(Boolean);
}

// Only one inserted, removed or substituted letter; never blur sequel numbers.
function oneLetterApart(a, b) {
  if (Math.min(a.length, b.length) < 6 || Math.abs(a.length - b.length) > 1) return false;
  if (a.replace(/\D/gu, "") !== b.replace(/\D/gu, "")) return false;
  if (a.length > b.length) return oneLetterApart(b, a);
  let i = 0;
  while (i < a.length && a[i] === b[i]) i += 1;
  return a.slice(i + (a.length === b.length ? 1 : 0)) === b.slice(i + 1);
}

export function compareMovies(a, b) {
  const at = titles(a);
  const bt = titles(b);
  const sameTitle = at.some((title) => bt.includes(title));
  const similarTitle = at.some((title) => bt.some((other) => oneLetterApart(title, other)));
  const sameImdb = Boolean(a.imdbId && a.imdbId === b.imdbId);
  const sameTmdb = Boolean(a.tmdbId && a.tmdbId === b.tmdbId);
  const sameYear = a.releaseYear && String(a.releaseYear) === String(b.releaseYear);
  const ad = directors(a);
  const bd = directors(b);
  const sameDirector = ad.some((name) => bd.includes(name));
  const sameDuration = a.durationMinutes && b.durationMinutes && Math.abs(a.durationMinutes - b.durationMinutes) <= 2;
  // Cinemas sometimes list the local premiere year instead of production year.
  // Require all three independent metadata fields, never a fuzzy title alone.
  const premiereYear = Math.abs(Number(a.releaseYear) - Number(b.releaseYear)) === 1
    && sameTitle && sameDirector && sameDuration;
  const conflicts = [];
  if (a.imdbId && b.imdbId && a.imdbId !== b.imdbId) conflicts.push("imdbId");
  if (a.tmdbId && b.tmdbId && a.tmdbId !== b.tmdbId) conflicts.push("tmdbId");
  if (a.csfdId && b.csfdId && a.csfdId !== b.csfdId) conflicts.push("csfdId");
  if (a.releaseYear && b.releaseYear && !sameYear && !premiereYear) conflicts.push("releaseYear");
  if (ad.length && bd.length && !sameDirector) conflicts.push("directors");
  if (a.durationMinutes && b.durationMinutes && Math.abs(a.durationMinutes - b.durationMinutes) > 5) conflicts.push("durationMinutes");
  const reason = sameImdb ? "shared-imdb" : sameTmdb ? "shared-tmdb"
    : premiereYear ? "title-director-duration-premiere-year"
      : sameTitle ? "normalized-title"
        : similarTitle && sameYear && (sameDirector || sameDuration) ? "corroborated-typo" : null;
  return {
    matches: Boolean(reason && conflicts.length === 0),
    candidate: Boolean(sameTitle || similarTitle || sameImdb || sameTmdb),
    reason,
    conflicts,
  };
}

export function moviesMatch(a, b) {
  return compareMovies(a, b).matches;
}

function completeness(movie) {
  return [movie.imdbId, movie.tmdbId, movie.releaseYear, movie.originalTitle, movie.englishTitle,
    directors(movie).length, movie.durationMinutes, movie.posterUrl].filter(Boolean).length;
}

function merge(current, incoming) {
  const result = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    if (Array.isArray(value)) result[key] = key === "genres"
      ? normalizeGenres([...(result[key] || []), ...value])
      : [...new Set(key === "directors"
        ? [...(result[key] || []), ...value].flatMap((name) => name.split(/,\s*/u)).map((name) => name.trim()).filter(Boolean)
        : [...(result[key] || []), ...value])];
    else if (result[key] == null || result[key] === "") result[key] = value;
  }
  return result;
}

function groupMovies(movies) {
  const groups = [];
  // Rich records first make missing-year matches unambiguous; ID breaks ties
  // independently of the order in which cinema responses arrive.
  const ordered = movies
    .map((movie) => ({ ...movie, genres: normalizeGenres(movie.genres) }))
    .sort((a, b) => completeness(b) - completeness(a) || a.id.localeCompare(b.id));
  for (const movie of ordered) {
    const candidates = groups.filter((group) => group.members.every((member) => compareMovies(member, movie).conflicts.length === 0)
      && group.members.some((member) => moviesMatch(member, movie)));
    if (candidates.length === 1) {
      candidates[0].members.push(movie);
      candidates[0].movie = merge(candidates[0].movie, movie);
    } else {
      groups.push({ movie: { ...movie }, members: [movie] });
    }
  }
  return groups;
}

export function auditMovieDuplicates(program) {
  const groups = groupMovies(program.movies);
  const groupById = new Map(groups.flatMap((group, index) => group.members.map((movie) => [movie.id, index])));
  const movies = [...program.movies].sort((a, b) => a.id.localeCompare(b.id));
  const findings = [];
  for (let i = 0; i < movies.length; i += 1) {
    for (let j = i + 1; j < movies.length; j += 1) {
      const a = movies[i];
      const b = movies[j];
      const evidence = compareMovies(a, b);
      if (!evidence.candidate) continue;
      const merged = groupById.get(a.id) === groupById.get(b.id);
      findings.push({
        status: merged ? "merge" : "review",
        movieIds: [a.id, b.id],
        titles: [a.title, b.title],
        sources: [a.source || null, b.source || null],
        years: [a.releaseYear || null, b.releaseYear || null],
        reason: evidence.reason || "similar-title-insufficient-evidence",
        conflicts: evidence.conflicts,
        ...(merged ? { canonicalId: groups[groupById.get(a.id)].movie.id }
          : { reviewReason: evidence.conflicts.length ? "conflicting-metadata"
            : evidence.matches ? "ambiguous-group" : "insufficient-evidence" }),
      });
    }
  }
  return findings;
}

export function deduplicateMovies(program) {
  const groups = groupMovies(program.movies);
  const ids = new Map(groups.flatMap((group) => group.members.map((movie) => [movie.id, group.movie.id])));
  return {
    ...program,
    movies: groups.map((group) => group.movie).sort((a, b) => a.title.localeCompare(b.title, "sk")),
    screenings: program.screenings.map((screening) => ({ ...screening, movieId: ids.get(screening.movieId) || screening.movieId })),
  };
}
