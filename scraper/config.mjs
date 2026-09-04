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
    id: "film-europe",
    sourceId: "kino-film-europe",
    name: "Kino Film Europe",
    shortName: "Film Europe",
    url: "https://www.kfe.sk/",
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
  {
    id: "edison-filmhub",
    sourceId: "edison-filmhub",
    name: "Edison Filmhub Bratislava",
    shortName: "Edison Filmhub",
    url: "https://edisonfilmhub.sk/",
  },
  {
    id: "nova-cvernovka",
    sourceId: "nova-cvernovka",
    name: "Nová Cvernovka",
    shortName: "Nová Cvernovka",
    url: "https://novacvernovka.eu/program",
  },
  {
    id: "a4-kino-inak",
    sourceId: "a4-kino-inak",
    name: "A4 – Kino inak",
    shortName: "A4 Kino inak",
    url: "https://a4.sk/events/kino-inak-sk/",
  },
];

export const LUMIERE_PROGRAM_URL = "https://www.kino-lumiere.sk/klient-863/kino-241/stranka-19175";
export const LUMIERE_PROGRAM_EN_URL = `${LUMIERE_PROGRAM_URL}/jazyk-en_GB`;
export const FILM_EUROPE_PROGRAM_URL = "https://www.kfe.sk/cely-program";
export const MLADOST_PROGRAM_URL = "https://www.kinomladost.sk/";
export const LUKY_PROGRAM_URL = "https://www.kzp.sk/podujatia/kino?place=80";
export const NOSTALGIA_PROGRAM_URL = "https://www.nostalgia.sk/";
export const EDISON_PROGRAM_URL = "https://edisonfilmhub.sk/program";
export const EDISON_EN_URL = "https://edisonfilmhub.sk/en";
export const EDISON_PROGRAM_EN_URL = "https://edisonfilmhub.sk/programme";
export const NOVA_CVERNOVKA_PROGRAM_URL = "https://novacvernovka.eu/program";
export const NOVA_CVERNOVKA_PROGRAM_EN_URL = `${NOVA_CVERNOVKA_PROGRAM_URL}?lang=en`;
export const A4_KINO_INAK_PROGRAM_URL = "https://a4.sk/events/kino-inak-sk/";
export const A4_KINO_INAK_PROGRAM_EN_URL = "https://a4.sk/en/events/kino-inak-en/";
