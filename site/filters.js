const CZ_SK_COUNTRY_CODES = new Set(["CS", "CZ", "SK", "XC"]);

export function isCzSkMovie(movie, screening = null) {
  if (movie.productionCountries?.length) {
    return movie.productionCountries.some((code) => CZ_SK_COUNTRY_CODES.has(code));
  }
  return screening?.languages?.original?.some((code) => code === "cs" || code === "sk") || false;
}
