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
  return (movie.directors || []).map(normalize).filter(Boolean);
}

function compatible(a, b) {
  if (a.imdbId && b.imdbId && a.imdbId !== b.imdbId) return false;
  if (a.releaseYear && b.releaseYear && String(a.releaseYear) !== String(b.releaseYear)) return false;
  const ad = directors(a);
  const bd = directors(b);
  if (ad.length && bd.length && !ad.some((name) => bd.includes(name))) return false;
  return !(a.durationMinutes && b.durationMinutes && Math.abs(a.durationMinutes - b.durationMinutes) > 5);
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

export function moviesMatch(a, b) {
  if (!compatible(a, b)) return false;
  if (a.imdbId && a.imdbId === b.imdbId) return true;
  const at = titles(a);
  const bt = titles(b);
  if (at.some((title) => bt.includes(title))) return true;
  const sameYear = a.releaseYear && String(a.releaseYear) === String(b.releaseYear);
  const sameDirector = directors(a).some((name) => directors(b).includes(name));
  const sameDuration = a.durationMinutes && b.durationMinutes && Math.abs(a.durationMinutes - b.durationMinutes) <= 2;
  return Boolean(sameYear && (sameDirector || sameDuration)
    && at.some((title) => bt.some((other) => oneLetterApart(title, other))));
}

function completeness(movie) {
  return [movie.imdbId, movie.releaseYear, movie.originalTitle, movie.englishTitle,
    directors(movie).length, movie.durationMinutes, movie.posterUrl].filter(Boolean).length;
}

function merge(current, incoming) {
  const result = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    if (Array.isArray(value)) result[key] = key === "genres"
      ? normalizeGenres([...(result[key] || []), ...value])
      : [...new Set([...(result[key] || []), ...value])];
    else if (result[key] == null || result[key] === "") result[key] = value;
  }
  return result;
}

export function deduplicateMovies(program) {
  const groups = [];
  // Rich records first make missing-year matches unambiguous; ID breaks ties
  // independently of the order in which cinema responses arrive.
  const ordered = program.movies
    .map((movie) => ({ ...movie, genres: normalizeGenres(movie.genres) }))
    .sort((a, b) => completeness(b) - completeness(a) || a.id.localeCompare(b.id));
  for (const movie of ordered) {
    const candidates = groups.filter((group) => group.members.every((member) => compatible(member, movie))
      && group.members.some((member) => moviesMatch(member, movie)));
    if (candidates.length === 1) {
      candidates[0].members.push(movie);
      candidates[0].movie = merge(candidates[0].movie, movie);
    } else {
      groups.push({ movie: { ...movie }, members: [movie] });
    }
  }
  const ids = new Map(groups.flatMap((group) => group.members.map((movie) => [movie.id, group.movie.id])));
  return {
    ...program,
    movies: groups.map((group) => group.movie).sort((a, b) => a.title.localeCompare(b.title, "sk")),
    screenings: program.screenings.map((screening) => ({ ...screening, movieId: ids.get(screening.movieId) || screening.movieId })),
  };
}
