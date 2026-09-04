import { CINEMAS, MLADOST_PROGRAM_URL } from "../config.mjs";
import { fetchCinemawareTable, parseCinemawareTable } from "./cinemaware-table.mjs";

const cinema = CINEMAS.find((item) => item.id === "mladost");

export function parseMladost(html) {
  return parseCinemawareTable(html, cinema, { baseUrl: MLADOST_PROGRAM_URL });
}

export function fetchMladost() {
  return fetchCinemawareTable(cinema, MLADOST_PROGRAM_URL);
}
