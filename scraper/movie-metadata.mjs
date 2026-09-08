export function metadataText(value) {
  return typeof value === "string" && value.trim() && value.trim() !== "N/A" ? value.trim() : null;
}

export function fillMovieMetadata(movie, metadata) {
  const result = { ...movie };
  for (const key of ["originalTitle", "englishTitle", "releaseYear", "durationMinutes", "directors", "tmdbId", "posterUrl"]) {
    const value = metadata?.[key];
    if ((!result[key] || (key === "englishTitle" && result[key].toLocaleLowerCase("sk") === movie.title?.toLocaleLowerCase("sk"))
      || (Array.isArray(result[key]) && !result[key].length))
      && value && (!Array.isArray(value) || value.length)) result[key] = value;
  }
  const languages = { sk: 3, cs: 2, en: 1 };
  if (metadata?.overview && (!result.overview
    || (languages[metadata.overviewLanguage] || 0) > (languages[result.overviewLanguage] || 0))) {
    result.overview = metadata.overview;
    result.overviewLanguage = metadata.overviewLanguage;
  }
  return result;
}
