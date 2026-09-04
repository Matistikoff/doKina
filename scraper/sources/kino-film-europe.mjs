import { CINEMAS, FILM_EUROPE_PROGRAM_URL } from "../config.mjs";
import { fetchCinemawareTable, parseCinemawareTable } from "./cinemaware-table.mjs";

const cinema = CINEMAS.find((item) => item.id === "film-europe");

export function parseFilmEurope(html) {
  return parseCinemawareTable(html, cinema, { baseUrl: FILM_EUROPE_PROGRAM_URL });
}

export function fetchFilmEurope() {
  return fetchCinemawareTable(cinema, FILM_EUROPE_PROGRAM_URL);
}
