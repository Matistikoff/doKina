import { FILM_EUROPE_PROGRAM_URL } from "../config.mjs";
import { fetchEntradioEvents } from "./entradio.mjs";
import { parseEntradioEventList, parseEntradioEvents } from "./kino-nostalgia.mjs";

export function parseFilmEurope(html) {
  return parseEntradioEvents(html, {
    cinemaId: "film-europe",
    sourceId: "kino-film-europe",
    programUrl: FILM_EUROPE_PROGRAM_URL,
    cinemaName: "Kino Film Europe",
  });
}

export async function fetchFilmEurope(options = {}) {
  return parseEntradioEventList(await fetchEntradioEvents({ ...options, clientId: 32, venueId: 240 }), {
    cinemaId: "film-europe",
    sourceId: "kino-film-europe",
    programUrl: FILM_EUROPE_PROGRAM_URL,
    cinemaName: "Kino Film Europe",
  });
}
