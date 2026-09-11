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
    if (movie.originalLanguage != null && !/^[a-z]{2}$/u.test(movie.originalLanguage)) errors.push(`invalid originalLanguage for ${movie.id}`);
    if (movie.spokenLanguages != null && (!Array.isArray(movie.spokenLanguages)
      || !movie.spokenLanguages.every((code) => /^[a-z]{2}$/u.test(code)))) errors.push(`invalid spokenLanguages for ${movie.id}`);
    if (movie.overview != null && !isString(movie.overview)) errors.push(`invalid overview for ${movie.id}`);
    if (movie.overviewLanguage != null && !["sk", "cs", "en"].includes(movie.overviewLanguage)) errors.push(`invalid overviewLanguage for ${movie.id}`);
    if (movie.actors != null && (!Array.isArray(movie.actors) || !movie.actors.every(isString))) errors.push(`invalid actors for ${movie.id}`);
    if (movie.cast != null && (!Array.isArray(movie.cast) || !movie.cast.every((person) => person
      && isString(person.name)
      && (person.character == null || isString(person.character))
      && (person.profileUrl == null || /^https:\/\/image\.tmdb\.org\/t\/p\/w185\/[\w.-]+$/u.test(person.profileUrl))))) {
      errors.push(`invalid cast for ${movie.id}`);
    }
    if (movie.productionCountries != null && (!Array.isArray(movie.productionCountries)
      || !movie.productionCountries.every((code) => /^[A-Z]{2}$/.test(code)))) errors.push(`invalid productionCountries for ${movie.id}`);
    if (movie.backdropUrl != null && !/^https:\/\/image\.tmdb\.org\/t\/p\/w1280\/[\w.-]+$/u.test(movie.backdropUrl)) errors.push(`invalid backdropUrl for ${movie.id}`);
    if (movie.trailerUrl != null && !/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{6,20}$/u.test(movie.trailerUrl)) errors.push(`invalid trailerUrl for ${movie.id}`);
    if (movie.tmdbId != null && (!Number.isInteger(movie.tmdbId) || movie.tmdbId <= 0)) errors.push(`invalid tmdbId for ${movie.id}`);
    if (movie.imdbId != null && !/^tt\d+$/.test(movie.imdbId)) errors.push(`invalid imdbId: ${movie.imdbId}`);
    if (movie.imdbRating != null && (!Number.isFinite(movie.imdbRating) || movie.imdbRating < 1 || movie.imdbRating > 10)) errors.push(`invalid imdbRating: ${movie.imdbRating}`);
    if (movie.imdbVotes != null && (!Number.isInteger(movie.imdbVotes) || movie.imdbVotes < 0)) errors.push(`invalid imdbVotes: ${movie.imdbVotes}`);
    for (const key of ["metascore", "rottenTomatoesRating"]) {
      if (movie[key] != null && (!Number.isInteger(movie[key]) || movie[key] < 0 || movie[key] > 100)) errors.push(`invalid ${key} for ${movie.id}`);
    }
    if (movie.rottenTomatoesId != null && !/^m\/[0-9A-Za-z_][-0-9A-Za-z_'.]*$/u.test(movie.rottenTomatoesId)) errors.push(`invalid rottenTomatoesId for ${movie.id}`);
    if (movie.metacriticId != null && !/^movie\/[-a-z0-9!+_()]+$/u.test(movie.metacriticId)) errors.push(`invalid metacriticId for ${movie.id}`);
    for (const key of ["oscarWins", "budgetUsd", "worldwideGrossUsd"]) {
      if (movie[key] != null && (!Number.isSafeInteger(movie[key]) || movie[key] < 0)) errors.push(`invalid ${key} for ${movie.id}`);
    }
    if (movie.csfdId != null && (!Number.isInteger(movie.csfdId) || movie.csfdId <= 0)) errors.push(`invalid csfdId for ${movie.id}`);
    if (movie.csfdRating != null && (!Number.isFinite(movie.csfdRating) || movie.csfdRating < 0 || movie.csfdRating > 100 || !movie.csfdId)) errors.push(`invalid csfdRating for ${movie.id}`);
    if (movie.csfdVotes != null && (!Number.isInteger(movie.csfdVotes) || movie.csfdVotes < 0)) errors.push(`invalid csfdVotes for ${movie.id}`);
    if (movie.alternativeTitles != null && (!Array.isArray(movie.alternativeTitles) || !movie.alternativeTitles.every(isString))) errors.push(`invalid alternativeTitles for ${movie.id}`);
    if (movie.firstSeenAt != null && (!isString(movie.firstSeenAt) || Number.isNaN(Date.parse(movie.firstSeenAt)))) errors.push(`invalid firstSeenAt for ${movie.id}`);
  }

  for (const screening of program?.screenings || []) {
    if (!isString(screening.id)) errors.push("each screening needs an id");
    if (screeningIds.has(screening.id)) errors.push(`duplicate screening id: ${screening.id}`);
    screeningIds.add(screening.id);
    if (!movieIds.has(screening.movieId)) errors.push(`unknown movieId: ${screening.movieId}`);
    if (!cinemaIds.has(screening.cinemaId)) errors.push(`unknown cinemaId: ${screening.cinemaId}`);
    if (!isString(screening.startsAt) || Number.isNaN(Date.parse(screening.startsAt))) errors.push(`invalid startsAt: ${screening.startsAt}`);
    if (screening.detailUrl != null && !isString(screening.detailUrl)) errors.push(`invalid detailUrl for ${screening.id}`);
  }

  if (errors.length) throw new Error(`Invalid program.json:\n- ${errors.join("\n- ")}`);
  return program;
}
