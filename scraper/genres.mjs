import { collapseWhitespace } from "./utils.mjs";

const GENRE_ALIASES = new Map(Object.entries({
  action: "Akčný",
  akcne: "Akčné",
  akcny: "Akčný",
  adventure: "Dobrodružný",
  animation: "Animovaný",
  animated: "Animovaný",
  animovany: "Animovaný",
  comedy: "Komédia",
  komedia: "Komédia",
  crime: "Krimi",
  documentary: "Dokumentárny",
  dokument: "Dokumentárny",
  dokumentarny: "Dokumentárny",
  drama: "Dráma",
  family: "Rodinný",
  fantasy: "Fantasy",
  history: "Historický",
  horror: "Horor",
  music: "Hudobný",
  mystery: "Mysteriózny",
  romance: "Romantický",
  romanticky: "Romantický",
  "science-fiction": "Sci-Fi",
  "science-fiction-film": "Sci-Fi",
  "sci-fi": "Sci-Fi",
  sport: "Športový",
  sportovy: "Športový",
  thriller: "Thriller",
  war: "Vojnový",
  western: "Western",
  "zaner-pasmo-kratkych-filmov": "Pásmo krátkych filmov",
  "pasmo-kratkych-filmov": "Pásmo krátkych filmov",
}));

function genreKey(value) {
  return collapseWhitespace(String(value || ""))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("sk")
    .replace(/[_\s]+/gu, "-")
    .replace(/[^a-z0-9-]+/gu, "")
    .replace(/^-+|-+$/gu, "");
}

export function normalizeGenre(value) {
  const genre = collapseWhitespace(String(value || ""));
  if (!genre) return null;
  return GENRE_ALIASES.get(genreKey(genre)) || genre;
}

export function normalizeGenres(values = []) {
  return [...new Set(values.map(normalizeGenre).filter(Boolean))];
}
