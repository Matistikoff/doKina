function comparableTitle(title) {
  return String(title || "")
    .normalize("NFKC")
    .toLocaleLowerCase("sk")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function alternativeMovieTitle(movie) {
  const mainTitle = comparableTitle(movie.title);
  return [movie.originalTitle, movie.englishTitle]
    .find((title) => title && comparableTitle(title) !== mainTitle) || null;
}
