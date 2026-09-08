export function ratingAudit(movies, diagnostics = []) {
  const statuses = new Map(diagnostics.map((item) => [item.id, item]));
  return {
    total: movies.length,
    imdbRated: movies.filter((movie) => Number.isFinite(movie.imdbRating)).length,
    csfdRated: movies.filter((movie) => Number.isFinite(movie.csfdRating)).length,
    eitherRated: movies.filter((movie) => Number.isFinite(movie.imdbRating) || Number.isFinite(movie.csfdRating)).length,
    missingImdb: movies.filter((movie) => !Number.isFinite(movie.imdbRating)).map((movie) => ({
      id: movie.id, title: movie.title, imdbId: movie.imdbId || null,
      status: statuses.get(movie.id)?.status || (movie.imdbId ? "not-checked" : "identity-missing"),
    })),
  };
}
