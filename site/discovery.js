export const MUST_WATCH_IMDB_RATING = 8;

export function isMustWatch(movie) {
  return Number.isFinite(movie.imdbRating) && movie.imdbRating >= MUST_WATCH_IMDB_RATING;
}

export function compareMoviesByDuration(a, b, direction = "shortest") {
  const durationA = Number.isFinite(a.durationMinutes) && a.durationMinutes > 0 ? a.durationMinutes : null;
  const durationB = Number.isFinite(b.durationMinutes) && b.durationMinutes > 0 ? b.durationMinutes : null;

  if (durationA === null && durationB === null) return a.title.localeCompare(b.title, "sk");
  if (durationA === null) return 1;
  if (durationB === null) return -1;

  const difference = direction === "longest" ? durationB - durationA : durationA - durationB;
  return difference || a.title.localeCompare(b.title, "sk");
}
