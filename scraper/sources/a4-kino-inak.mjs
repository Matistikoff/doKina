import * as cheerio from "cheerio";
import {
  A4_KINO_INAK_PROGRAM_EN_URL,
  A4_KINO_INAK_PROGRAM_URL,
  TIMEZONE,
} from "../config.mjs";
import { cleanTitle, collapseWhitespace, fetchBrowserHtml, movieId, zonedIso } from "../utils.mjs";

function absoluteUrl(value, baseUrl = A4_KINO_INAK_PROGRAM_URL) {
  if (!value || value.trim() === "#") return null;
  return new URL(value.trim(), baseUrl).href;
}

function filmTitle(value) {
  return cleanTitle(value)
    .replace(/\s*\+\s*Q\s*(?:&|and)\s*A\b.*$/iu, "")
    .trim();
}

function dateFromUrl(value) {
  const match = value?.match(/\/((?:19|20)\d{2})\/(\d{2})\/(\d{2})\//u);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function timeFromItem(item, $) {
  return collapseWhitespace(item.find(".event-item__name .bar__item").first().text())
    .match(/\b(\d{1,2}:\d{2})\b/u)?.[1] || null;
}

function eventKey(bookingUrl, date, time) {
  return bookingUrl ? `booking:${bookingUrl}` : `datetime:${date}T${time}`;
}

function addLanguage(result, field, code) {
  if (!result[field].includes(code)) result[field].push(code);
}

function parseLanguages(value) {
  const text = collapseWhitespace(value).toLocaleLowerCase("sk");
  const result = { original: [], dubbed: [], voiceover: [], subtitles: [] };
  const languages = [
    { code: "sk", names: ["slovenčina", "slovak"], subtitleRoots: ["slovensk", "slovak"] },
    { code: "cs", names: ["čeština", "czech"], subtitleRoots: ["česk", "czech"] },
    { code: "en", names: ["angličtina", "english"], subtitleRoots: ["anglick", "english"] },
    { code: "fr", names: ["francúzština", "french"], subtitleRoots: ["francúzsk", "french"] },
    { code: "de", names: ["nemčina", "german"], subtitleRoots: ["nemeck", "german"] },
    { code: "es", names: ["španielčina", "spanish"], subtitleRoots: ["španielsk", "spanish"] },
    { code: "it", names: ["taliančina", "italian"], subtitleRoots: ["taliansk", "italian"] },
    { code: "pl", names: ["poľština", "polish"], subtitleRoots: ["poľsk", "polish"] },
    { code: "uk", names: ["ukrajinčina", "ukrainian"], subtitleRoots: ["ukrajinsk", "ukrainian"] },
  ];
  const originalText = text.split(/\s*(?:\+|with)\s*(?=[^,]*(?:titulk|subtit))/u)[0];
  for (const language of languages) {
    if (language.names.some((name) => originalText.includes(name))) addLanguage(result, "original", language.code);
  }
  const subtitleText = text.match(/(?:\+|with)\s*([^,]*(?:titulk\p{L}*|subtitles?))/u)?.[1]
    || text.match(/([^,]*(?:titulk\p{L}*|subtitles?))/u)?.[1]
    || "";
  for (const language of languages) {
    if (language.subtitleRoots.some((root) => subtitleText.includes(root))) {
      addLanguage(result, "subtitles", language.code);
    }
  }
  return result;
}

function listItems(html, baseUrl) {
  const $ = cheerio.load(html);
  return $(".js-ajax-posts-loop .event-item, .ajax-posts__loop .event-item").map((_, element) => {
    const item = $(element);
    const titleLink = item.find(".event-item__name h2 a, h2 .faux-link__control").first();
    const detailUrl = absoluteUrl(titleLink.attr("href"), baseUrl);
    const date = dateFromUrl(detailUrl);
    const time = timeFromItem(item, $);
    const bookingUrl = absoluteUrl(item.find(".event-item__button[href], a.btn--primary[href]").first().attr("href"), baseUrl);
    return {
      externalId: item.attr("id")?.match(/^teaser-(\d+)$/u)?.[1] || null,
      title: filmTitle(collapseWhitespace(titleLink.text())),
      detailUrl,
      bookingUrl,
      date,
      time,
      price: collapseWhitespace(item.find(".event-item__price strong, .event-item__price p.text-small").first().text()) || null,
      posterUrl: absoluteUrl(item.find(".event-item__thumbnail img").first().attr("src"), baseUrl),
    };
  }).get().filter((item) => item.title && item.detailUrl && item.date && item.time);
}

export function parseA4EnglishTitles(html) {
  const titles = new Map();
  for (const item of listItems(html, A4_KINO_INAK_PROGRAM_EN_URL)) {
    titles.set(eventKey(item.bookingUrl, item.date, item.time), item.title);
  }
  return titles;
}

export function parseA4KinoInak(html, options = {}) {
  const englishTitles = options.englishTitles || new Map();
  const moviesById = new Map();
  const screenings = [];

  for (const item of listItems(html, A4_KINO_INAK_PROGRAM_URL)) {
    const id = movieId(item.title);
    const englishTitle = englishTitles.get(eventKey(item.bookingUrl, item.date, item.time)) || null;
    if (!moviesById.has(id)) {
      moviesById.set(id, {
        id,
        source: "a4-kino-inak",
        externalId: item.externalId,
        title: item.title,
        englishTitle: englishTitle && englishTitle.toLocaleLowerCase("sk") !== item.title.toLocaleLowerCase("sk")
          ? englishTitle
          : null,
        originalTitle: null,
        releaseYear: null,
        directors: [],
        durationMinutes: null,
        ageRating: null,
        genres: [],
        posterUrl: item.posterUrl,
        detailUrl: item.detailUrl,
      });
    }
    const externalId = item.externalId || `${item.date}-${item.time}-${id}`;
    screenings.push({
      id: `a4-kino-inak-${externalId}`,
      source: "a4-kino-inak",
      externalId: String(externalId),
      movieId: id,
      cinemaId: "a4-kino-inak",
      startsAt: zonedIso(item.date, item.time, TIMEZONE),
      auditorium: null,
      format: [],
      languages: { original: [], dubbed: [], voiceover: [], subtitles: [] },
      price: item.price,
      soldOut: false,
      availabilityRatio: null,
      detailUrl: item.detailUrl,
      bookingUrl: item.bookingUrl,
    });
  }

  if (screenings.length === 0) throw new Error("A4 Kino inak page contained no recognizable screenings");
  return { movies: [...moviesById.values()], screenings };
}

export function parseA4KinoInakDetails(html, baseUrl = A4_KINO_INAK_PROGRAM_URL) {
  const $ = cheerio.load(html);
  const article = $("#main article").first();
  const metadata = collapseWhitespace(article.find("section > p").first().find("strong, b").first().text());
  const directorText = metadata.match(/(?:Réžia|Directed by)\s*:\s*([^,]+)/iu)?.[1] || "";
  const ageRating = collapseWhitespace(article.find("section").first().text())
    .match(/(?:Odporúčaná prístupnosť|Recommended age rating)\s*:?\s*(\d{1,2})\s*\+/iu)?.[1] || null;
  const posterUrl = absoluteUrl(article.find("header > img").first().attr("src"), baseUrl);
  return {
    releaseYear: metadata.match(/\b((?:19|20)\d{2})\b/u)?.[1] || null,
    directors: directorText.split(/\s*(?:\/|&| a | and )\s*/iu).map(collapseWhitespace).filter(Boolean),
    durationMinutes: Number(metadata.match(/\b(\d{2,3})\s*min(?:s|út(?:a|y)?)?\b/iu)?.[1]) || null,
    ageRating,
    posterUrl,
    languages: parseLanguages(metadata),
  };
}

export async function fetchA4KinoInak() {
  const [html, englishHtml] = await Promise.all([
    fetchBrowserHtml(A4_KINO_INAK_PROGRAM_URL),
    fetchBrowserHtml(A4_KINO_INAK_PROGRAM_EN_URL).catch((error) => {
      console.warn(`A4 Kino inak English programme unavailable: ${error.message}`);
      return null;
    }),
  ]);
  const result = parseA4KinoInak(html, {
    englishTitles: englishHtml ? parseA4EnglishTitles(englishHtml) : new Map(),
  });
  const detailsByMovie = new Map(await Promise.all(result.movies.map(async (movie) => {
    try {
      const detailHtml = await fetchBrowserHtml(movie.detailUrl);
      return [movie.id, parseA4KinoInakDetails(detailHtml, movie.detailUrl)];
    } catch (error) {
      console.warn(`A4 Kino inak details unavailable for “${movie.title}”: ${error.message}`);
      return [movie.id, null];
    }
  })));
  return {
    movies: result.movies.map((movie) => {
      const details = detailsByMovie.get(movie.id);
      return details ? {
        ...movie,
        releaseYear: details.releaseYear,
        directors: details.directors,
        durationMinutes: details.durationMinutes,
        ageRating: details.ageRating,
        posterUrl: details.posterUrl || movie.posterUrl,
      } : movie;
    }),
    screenings: result.screenings.map((screening) => {
      const details = detailsByMovie.get(screening.movieId);
      return details ? { ...screening, languages: details.languages } : screening;
    }),
  };
}
