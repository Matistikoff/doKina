const isString = (value) => typeof value === "string" && value.length > 0;

export function validateProgram(program) {
  const errors = [];
  if (program?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!isString(program?.generatedAt) || Number.isNaN(Date.parse(program.generatedAt))) errors.push("generatedAt must be an ISO date");
  if (program?.timezone !== "Europe/Bratislava") errors.push("timezone must be Europe/Bratislava");
  if (!Array.isArray(program?.sources) || program.sources.length < 2) errors.push("sources must include the configured providers");
  if (!Array.isArray(program?.cinemas) || program.cinemas.length < 4) errors.push("cinemas must include the configured locations");
  if (!Array.isArray(program?.movies)) errors.push("movies must be an array");
  if (!Array.isArray(program?.screenings)) errors.push("screenings must be an array");

  const cinemaIds = new Set((program?.cinemas || []).map((item) => item.id));
  const movieIds = new Set((program?.movies || []).map((item) => item.id));
  const screeningIds = new Set();

  for (const movie of program?.movies || []) {
    if (!isString(movie.id) || !isString(movie.title)) errors.push("each movie needs an id and title");
    if (movie.englishTitle != null && !isString(movie.englishTitle)) errors.push(`invalid englishTitle: ${movie.englishTitle}`);
    if (movie.overview != null && !isString(movie.overview)) errors.push(`invalid overview for ${movie.id}`);
    if (movie.overviewLanguage != null && !["sk", "cs", "en"].includes(movie.overviewLanguage)) errors.push(`invalid overviewLanguage for ${movie.id}`);
    if (movie.tmdbId != null && (!Number.isInteger(movie.tmdbId) || movie.tmdbId <= 0)) errors.push(`invalid tmdbId for ${movie.id}`);
    if (movie.tmdbRating != null && (!Number.isFinite(movie.tmdbRating) || movie.tmdbRating <= 0 || movie.tmdbRating > 10)) errors.push(`invalid tmdbRating: ${movie.tmdbRating}`);
    if (movie.tmdbVotes != null && (!Number.isInteger(movie.tmdbVotes) || movie.tmdbVotes < 0)) errors.push(`invalid tmdbVotes: ${movie.tmdbVotes}`);
    if (movie.imdbId != null && !/^tt\d+$/.test(movie.imdbId)) errors.push(`invalid imdbId: ${movie.imdbId}`);
    if (movie.firstSeenAt != null && (!isString(movie.firstSeenAt) || Number.isNaN(Date.parse(movie.firstSeenAt)))) errors.push(`invalid firstSeenAt for ${movie.id}`);
  }

  for (const screening of program?.screenings || []) {
    if (!isString(screening.id)) errors.push("each screening needs an id");
    if (screeningIds.has(screening.id)) errors.push(`duplicate screening id: ${screening.id}`);
    screeningIds.add(screening.id);
    if (!movieIds.has(screening.movieId)) errors.push(`unknown movieId: ${screening.movieId}`);
    if (!cinemaIds.has(screening.cinemaId)) errors.push(`unknown cinemaId: ${screening.cinemaId}`);
    if (!isString(screening.startsAt) || Number.isNaN(Date.parse(screening.startsAt))) errors.push(`invalid startsAt: ${screening.startsAt}`);
  }

  if (errors.length) throw new Error(`Invalid program.json:\n- ${errors.join("\n- ")}`);
  return program;
}
