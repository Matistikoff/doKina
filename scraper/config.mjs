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
];

export const CINEMA_CITY_API = "https://www.cinemacity.sk/sk/data-api-service/v1/quickbook/10105";
export const LUMIERE_PROGRAM_URL = "https://www.kino-lumiere.sk/klient-863/kino-241/stranka-19175";
