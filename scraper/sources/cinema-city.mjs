import { CINEMA_CITY_API, TIMEZONE } from "../config.mjs";
import { addDays, cleanTitle, fetchWithRetry, localDateKey, movieId, zonedIso } from "../utils.mjs";

const GENRES = new Map([
  ["action", "Akčný"], ["adventure", "Dobrodružný"], ["animation", "Animovaný"],
  ["biography", "Životopisný"], ["black-comedy", "Čierna komédia"], ["comedy", "Komédia"],
  ["crime", "Krimi"], ["documentary", "Dokumentárny"], ["drama", "Dráma"],
  ["family", "Rodinný"], ["fantasy", "Fantasy"], ["history", "Historický"],
  ["horror", "Horor"], ["musical", "Hudobný"], ["mystery", "Mysteriózny"],
  ["romance", "Romantický"], ["sci-fi", "Sci-Fi"], ["sport", "Športový"],
  ["thriller", "Thriller"], ["war", "Vojnový"], ["western", "Western"],
]);

const FORMATS = new Map([
  ["2d", "2D"], ["3d", "3D"], ["4dx", "4DX"], ["imax", "IMAX"],
  ["dolby-atmos", "Dolby Atmos"], ["laser-barco", "Laser"], ["vip", "VIP"],
  ["screenx", "ScreenX"], ["superscreen", "Superscreen"], ["recliners", "Comfort"],
]);

function rating(attributes) {
  const match = attributes.find((item) => /^(7|12|15|16|18)-plus$/.test(item));
  if (match) return `${match.split("-")[0]}+`;
  return attributes.includes("suitable-for-all") ? "MP" : null;
}

export function parseCinemaCity(payload, cinema, originalTitles = new Map()) {
  if (!payload?.body || !Array.isArray(payload.body.films) || !Array.isArray(payload.body.events)) {
    throw new Error(`Unexpected Cinema City response for ${cinema.name}`);
  }

  const films = new Map(payload.body.films.map((film) => [film.id, film]));
  const movies = payload.body.films.map((film) => {
    const title = cleanTitle(film.name);
    const originalTitle = cleanTitle(originalTitles.get(film.id) || "");
    return {
      id: movieId(title, film.releaseYear),
      source: "cinema-city",
      externalId: film.id,
      title,
      originalTitle: originalTitle && originalTitle !== title ? originalTitle : null,
      releaseYear: film.releaseYear || null,
      durationMinutes: Number.isFinite(film.length) ? film.length : null,
      ageRating: rating(film.attributeIds || []),
      genres: (film.attributeIds || []).filter((item) => GENRES.has(item)).map((item) => GENRES.get(item)),
      posterUrl: film.posterLink || null,
      detailUrl: film.link || null,
    };
  });

  const screenings = payload.body.events.map((event) => {
    const film = films.get(event.filmId);
    if (!film) throw new Error(`Cinema City event ${event.id} references a missing film`);
    return {
      id: `cinema-city-${cinema.externalId}-${event.id}`,
      source: "cinema-city",
      externalId: String(event.id),
      movieId: movieId(cleanTitle(film.name), film.releaseYear),
      cinemaId: cinema.id,
      startsAt: zonedIso(event.businessDay, event.eventDateTime.slice(11, 19), TIMEZONE),
      auditorium: event.auditorium ? event.auditorium.replace(/^Sala\b/i, "Sála") : null,
      format: (event.attributeIds || []).filter((item) => FORMATS.has(item)).map((item) => FORMATS.get(item)),
      languages: event.languages || { original: [], dubbed: [], voiceover: [], subtitles: [] },
      price: null,
      soldOut: Boolean(event.soldOut),
      availabilityRatio: Number.isFinite(event.availabilityRatio) ? event.availabilityRatio : null,
      bookingUrl: event.bookingRouterLaunchLink || event.bookingLink || null,
    };
  });

  return { movies, screenings };
}

export async function fetchCinemaCity(cinema, options = {}) {
  const today = options.today || localDateKey();
  const until = addDays(today, options.daysAhead ?? 10);
  const query = "attr=&lang=sk_SK";
  const datesUrl = `${CINEMA_CITY_API}/dates/in-cinema/${cinema.externalId}/until/${until}?${query}`;
  const datesPayload = await (await fetchWithRetry(datesUrl)).json();
  const dates = datesPayload?.body?.dates;
  if (!Array.isArray(dates)) throw new Error(`Unexpected Cinema City dates response for ${cinema.name}`);

  const chunks = [];
  for (const date of dates) {
    const baseUrl = `${CINEMA_CITY_API}/film-events/in-cinema/${cinema.externalId}/at-date/${date}?attr=&lang=`;
    const [payload, englishPayload] = await Promise.all([
      fetchWithRetry(`${baseUrl}sk_SK`).then((response) => response.json()),
      fetchWithRetry(`${baseUrl}en_GB`).then((response) => response.json()).catch((error) => {
        console.warn(`Cinema City English titles unavailable for ${cinema.name} on ${date}: ${error.message}`);
        return null;
      }),
    ]);
    const originalTitles = new Map((englishPayload?.body?.films || []).map((film) => [film.id, film.name]));
    chunks.push(parseCinemaCity(payload, cinema, originalTitles));
  }
  return {
    movies: chunks.flatMap((chunk) => chunk.movies),
    screenings: chunks.flatMap((chunk) => chunk.screenings),
  };
}
