import * as cheerio from "cheerio";
import {
  NOVA_CVERNOVKA_PROGRAM_EN_URL,
  NOVA_CVERNOVKA_PROGRAM_URL,
  TIMEZONE,
} from "../config.mjs";
import { cleanTitle, collapseWhitespace, fetchBrowserHtml, languageDetails, movieId, zonedIso } from "../utils.mjs";

function eventId(article) {
  return article.attr("id")?.match(/^post-(\d+)$/u)?.[1] || null;
}

function filmTitle(value) {
  return cleanTitle(value)
    .replace(/^(?:(?:letné\s+)?kino\s+(?:pod\s+palmou|v\s+novej\s+cvernovke))\s*[:|/]\s*/iu, "")
    .replace(/\s*\([^)]*\b(?:19|20)\d{2}\s*\)\s*$/u, "")
    .trim();
}

function releaseYear(value) {
  return value.match(/\b((?:19|20)\d{2})\b/u)?.[1] || null;
}

function languageInfo(value) {
  const result = languageDetails(value);
  const text = collapseWhitespace(value).toLocaleLowerCase("sk");
  const add = (field, code) => {
    if (!result[field].includes(code)) result[field].push(code);
  };

  if (/anglick\p{L}*\s+(?:znen\p{L}*|jazyk\p{L}*)/u.test(text)) add("original", "en");
  if (/slovensk\p{L}*\s+(?:znen\p{L}*|jazyk\p{L}*)/u.test(text)) add("original", "sk");
  if (/česk\p{L}*\s+(?:znen\p{L}*|jazyk\p{L}*)/u.test(text)) add("original", "cs");
  if (/anglick\p{L}*\s+titulk\p{L}*/u.test(text)) add("subtitles", "en");
  if (/slovensk\p{L}*\s+titulk\p{L}*/u.test(text)) add("subtitles", "sk");
  if (/česk\p{L}*\s+titulk\p{L}*/u.test(text)) add("subtitles", "cs");
  return result;
}

export function parseNovaCvernovkaEnglishTitles(html) {
  const $ = cheerio.load(html);
  const titles = new Map();
  $("article.tag-film, article.tag-movie").each((_, element) => {
    const article = $(element);
    const id = eventId(article);
    const title = filmTitle(collapseWhitespace(article.find(".entry-title").first().text()));
    if (id && title) titles.set(id, title);
  });
  return titles;
}

export function parseNovaCvernovka(html, options = {}) {
  const $ = cheerio.load(html);
  const englishTitles = options.englishTitles || new Map();
  const moviesById = new Map();
  const screenings = [];

  $("article.tag-film, article.tag-movie").each((_, element) => {
    const article = $(element);
    const externalId = eventId(article);
    const rawTitle = collapseWhitespace(article.find(".entry-title").first().text());
    const title = filmTitle(rawTitle);
    const dateValue = article.attr("data-start") || "";
    const dateMatch = dateValue.match(/^(\d{4})(\d{2})(\d{2})$/u);
    const time = article.find(".FilterItem__date-container > div").map((__, item) => collapseWhitespace($(item).text()))
      .get().find((value) => /^\d{1,2}:\d{2}$/u.test(value));
    if (!externalId || !title || !dateMatch || !time) return;

    const year = releaseYear(rawTitle);
    const id = movieId(title, year);
    const localizedTitle = englishTitles.get(externalId) || null;
    const detailUrl = article.find("a.entry-more-highlight").first().attr("href") || article.attr("data-href") || null;
    const posterUrl = article.find(".entry-figure img").first().attr("src") || null;

    if (!moviesById.has(id)) {
      moviesById.set(id, {
        id,
        source: "nova-cvernovka",
        externalId,
        title,
        englishTitle: localizedTitle && localizedTitle.toLocaleLowerCase("sk") !== title.toLocaleLowerCase("sk")
          ? localizedTitle
          : null,
        originalTitle: null,
        releaseYear: year,
        durationMinutes: null,
        ageRating: null,
        genres: [],
        posterUrl,
        detailUrl,
      });
    }

    const date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    screenings.push({
      id: `nova-cvernovka-${externalId}`,
      source: "nova-cvernovka",
      externalId,
      movieId: id,
      cinemaId: "nova-cvernovka",
      startsAt: zonedIso(date, time, TIMEZONE),
      auditorium: null,
      format: [],
      languages: languageDetails(""),
      price: null,
      soldOut: false,
      availabilityRatio: null,
      bookingUrl: null,
    });
  });

  if (screenings.length === 0) throw new Error("Nová Cvernovka page contained no recognizable film screenings");
  return { movies: [...moviesById.values()], screenings };
}

export function parseNovaCvernovkaDetails(html, detailUrl = NOVA_CVERNOVKA_PROGRAM_URL) {
  const $ = cheerio.load(html);
  const content = collapseWhitespace($("article .entry-content").text());
  const durationMinutes = Number(content.match(/\b(\d{2,3})\s*min(?:út(?:a|y)?)?\b/iu)?.[1]) || null;
  const bookingHref = $("article .entry-vstupne a[href]").first().attr("href");
  const auditorium = collapseWhitespace($("article .event-places, article .event-place, article .entry-place").first().text()) || null;
  return {
    releaseYear: releaseYear(content),
    durationMinutes,
    languages: languageInfo(content),
    bookingUrl: bookingHref ? new URL(bookingHref, detailUrl).href : null,
    auditorium,
  };
}

export async function fetchNovaCvernovka() {
  const [html, englishHtml] = await Promise.all([
    fetchBrowserHtml(NOVA_CVERNOVKA_PROGRAM_URL),
    fetchBrowserHtml(NOVA_CVERNOVKA_PROGRAM_EN_URL).catch((error) => {
      console.warn(`Nová Cvernovka English programme unavailable: ${error.message}`);
      return null;
    }),
  ]);
  const result = parseNovaCvernovka(html, {
    englishTitles: englishHtml ? parseNovaCvernovkaEnglishTitles(englishHtml) : new Map(),
  });

  const detailsByMovie = new Map(await Promise.all(result.movies.map(async (movie) => {
    if (!movie.detailUrl) return [movie.id, null];
    try {
      const detailHtml = await fetchBrowserHtml(movie.detailUrl);
      return [movie.id, parseNovaCvernovkaDetails(detailHtml, movie.detailUrl)];
    } catch (error) {
      console.warn(`Nová Cvernovka details unavailable for “${movie.title}”: ${error.message}`);
      return [movie.id, null];
    }
  })));

  return {
    movies: result.movies.map((movie) => {
      const details = detailsByMovie.get(movie.id);
      return details ? {
        ...movie,
        releaseYear: movie.releaseYear || details.releaseYear,
        durationMinutes: details.durationMinutes,
      } : movie;
    }),
    screenings: result.screenings.map((screening) => {
      const details = detailsByMovie.get(screening.movieId);
      return details ? {
        ...screening,
        languages: details.languages,
        bookingUrl: details.bookingUrl,
        auditorium: details.auditorium,
      } : screening;
    }),
  };
}
