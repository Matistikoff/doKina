function voteCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function preferredRating(movie) {
  const hasImdbRating = Number.isFinite(movie.imdbRating);
  const hasCsfdRating = Number.isFinite(movie.csfdRating);
  if (!hasImdbRating && !hasCsfdRating) return null;

  const imdbVotes = voteCount(movie.imdbVotes);
  const csfdVotes = voteCount(movie.csfdVotes);
  if (hasImdbRating && (!hasCsfdRating || imdbVotes >= csfdVotes)) {
    return {
      source: "IMDb",
      percent: Math.round(movie.imdbRating * 10),
      votes: imdbVotes,
    };
  }

  return {
    source: "ČSFD",
    percent: Math.round(movie.csfdRating),
    votes: csfdVotes,
  };
}

export function compareMoviesByRating(a, b) {
  const ratingA = preferredRating(a)?.percent ?? -1;
  const ratingB = preferredRating(b)?.percent ?? -1;
  return ratingB - ratingA || a.title.localeCompare(b.title, "sk");
}
