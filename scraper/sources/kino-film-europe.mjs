import { FILM_EUROPE_PROGRAM_URL } from "../config.mjs";
import { fetchBrowserHtml } from "../utils.mjs";
import { parseEntradioEvents } from "./kino-nostalgia.mjs";

export function parseFilmEurope(html) {
  return parseEntradioEvents(html, {
    cinemaId: "film-europe",
    sourceId: "kino-film-europe",
    programUrl: FILM_EUROPE_PROGRAM_URL,
    cinemaName: "Kino Film Europe",
  });
}

export async function fetchFilmEurope() {
  return parseFilmEurope(await fetchBrowserHtml(FILM_EUROPE_PROGRAM_URL));
}
