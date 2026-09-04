export const TIMEZONE = "Europe/Bratislava";
export const OUTPUT_PATH = new URL("../site/program.json", import.meta.url);

export const CINEMAS = [
  {
    id: "lumiere",
    sourceId: "kino-lumiere",
    externalId: "241",
    name: "Kino Lumière",
    shortName: "Lumière",
    url: "https://www.kino-lumiere.sk/",
  },
  {
    id: "cc-aupark",
    sourceId: "cinema-city",
    externalId: "1010",
    name: "Cinema City Aupark",
    shortName: "Aupark",
    url: "https://www.cinemacity.sk/cinemas/aupark/1010",
  },
  {
    id: "cc-eurovea",
    sourceId: "cinema-city",
    externalId: "1012",
    name: "Cinema City Eurovea",
    shortName: "Eurovea",
    url: "https://www.cinemacity.sk/cinemas/eurovea/1012",
  },
  {
    id: "cc-polus",
    sourceId: "cinema-city",
    externalId: "1011",
    name: "Cinema City POLUS",
    shortName: "POLUS",
    url: "https://www.cinemacity.sk/cinemas/polus/1011",
  },
  {
    id: "film-europe",
    sourceId: "kino-film-europe",
    name: "Kino Film Europe",
    shortName: "Film Europe",
    url: "https://cinevitaj.filmeurope.sk/",
  },
  {
    id: "mladost",
    sourceId: "kino-mladost",
    name: "Kino Mladosť",
    shortName: "Mladosť",
    url: "https://www.kinomladost.sk/",
  },
  {
    id: "luky",
    sourceId: "kino-luky",
    name: "Kino Lúky",
    shortName: "Lúky",
    url: "https://www.kzp.sk/podujatia/kino?place=80",
  },
  {
    id: "nostalgia",
    sourceId: "kino-nostalgia",
    name: "Kino Nostalgia Nivy",
    shortName: "Nostalgia",
    url: "https://www.nostalgia.sk/",
  },
];

export const CINEMA_CITY_API = "https://www.cinemacity.sk/sk/data-api-service/v1/quickbook/10105";
export const LUMIERE_PROGRAM_URL = "https://www.kino-lumiere.sk/klient-863/kino-241/stranka-19175";
export const LUMIERE_PROGRAM_EN_URL = `${LUMIERE_PROGRAM_URL}/jazyk-en_GB`;
export const FILM_EUROPE_PROGRAM_URL = "https://cinevitaj.filmeurope.sk/";
export const MLADOST_PROGRAM_URL = "https://www.kinomladost.sk/";
export const LUKY_PROGRAM_URL = "https://www.kzp.sk/podujatia/kino?place=80";
export const NOSTALGIA_PROGRAM_URL = "https://www.nostalgia.sk/";
