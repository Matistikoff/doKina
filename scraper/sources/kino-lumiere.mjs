import * as cheerio from "cheerio";
import { LUMIERE_PROGRAM_EN_URL, LUMIERE_PROGRAM_URL, TIMEZONE } from "../config.mjs";
import { cleanTitle, collapseWhitespace, fetchWithRetry, inferUpcomingDate, localDateKey, movieId, zonedIso } from "../utils.mjs";

function absoluteUrl(value) {
  if (!value || value === "#") return null;
  return new URL(value, LUMIERE_PROGRAM_URL).href;
}

function parseSubtitle(value) {
  const text = collapseWhitespace(value);
  const year = text.match(/\b((?:19|20)\d{2})\b/)?.[1] || null;
  const originalTitle = collapseWhitespace(text.split(";")[0]);
  const languageText = text.match(/jazyk:\s*([^,]+(?:,\s*[a-z]{3})*)/iu)?.[1] || "";
  return {
    originalTitle: originalTitle || null,
    releaseYear: year,
    languages: languageText ? languageText.split(",").map((item) => item.trim()).filter(Boolean) : [],
  };
}

export function parseEnglishTitles(html) {
  const $ = cheerio.load(html);
  const titles = new Map();
  $(".calendar-left-table-tr").each((_, row) => {
    const link = $(row).find("h2 a").first();
    const externalId = link.attr("href")?.match(/film-(\d+)/)?.[1];
    const title = cleanTitle(collapseWhitespace(link.find(".text-underline").first().text()).split(/\s*\|\s*/u)[0])
      .replace(/\s*\((?:19|20)\d{2}\)\s*$/u, "")
      .trim();
    if (externalId && title) titles.set(externalId, title);
  });
  return titles;
}

export function parseLumiere(html, options = {}) {
  const referenceDate = options.referenceDate || localDateKey();
  const englishTitles = options.englishTitles || new Map();
  const $ = cheerio.load(html);
  const moviesById = new Map();
  const screenings = [];

  $(".calendar-left-table-tr").each((_, row) => {
    const dateMatch = collapseWhitespace($(row).find(".ap_date").first().text()).match(/(\d{1,2})\.(\d{1,2})\./);
    const time = collapseWhitespace($(row).find(".ap_time").first().text()).match(/\d{1,2}:\d{2}/)?.[0];
    const rawTitle = collapseWhitespace($(row).find(".text-underline").first().text());
    if (!dateMatch || !time || !rawTitle) return;

    const title = cleanTitle(rawTitle);
    const details = parseSubtitle($(row).find(".event-subheader").first().text());
    const id = movieId(title, details.releaseYear);
    const date = inferUpcomingDate(Number(dateMatch[1]), Number(dateMatch[2]), referenceDate);
    const priceElement = $(row).find(".cal-event-item-buy").first();
    const priceText = collapseWhitespace(priceElement.text());
    const externalId = priceElement.attr("data-id") || `${date}-${time}-${id}`;
    const bookingUrl = absoluteUrl($(row).find(".cal-event-item-buy-span").attr("href"));
    const detailUrl = absoluteUrl($(row).find("h2 a").attr("href"));
    const movieExternalId = detailUrl?.match(/film-(\d+)/)?.[1] || null;

    if (!moviesById.has(id)) {
      moviesById.set(id, {
        id,
        source: "kino-lumiere",
        externalId: movieExternalId,
        title,
        englishTitle: movieExternalId ? englishTitles.get(movieExternalId) || null : null,
        originalTitle: details.originalTitle,
        releaseYear: details.releaseYear,
        durationMinutes: null,
        ageRating: null,
        genres: [],
        posterUrl: null,
        detailUrl,
      });
    }

    screenings.push({
      id: `kino-lumiere-${externalId}`,
      source: "kino-lumiere",
      externalId: String(externalId),
      movieId: id,
      cinemaId: "lumiere",
      startsAt: zonedIso(date, time, TIMEZONE),
      auditorium: null,
      format: [],
      languages: { original: details.languages, dubbed: [], voiceover: [], subtitles: [] },
      price: priceText && !/vypredan/iu.test(priceText) ? priceText : null,
      soldOut: /vypredan/iu.test(priceText),
      availabilityRatio: null,
      bookingUrl,
    });
  });

  if (screenings.length === 0) throw new Error("Kino Lumière page contained no recognizable screenings");
  return { movies: [...moviesById.values()], screenings };
}

export async function fetchLumiere(options = {}) {
  const [html, englishHtml] = await Promise.all([
    fetchWithRetry(LUMIERE_PROGRAM_URL).then((response) => response.text()),
    fetchWithRetry(LUMIERE_PROGRAM_EN_URL).then((response) => response.text()).catch((error) => {
      console.warn(`Kino Lumière English programme unavailable: ${error.message}`);
      return null;
    }),
  ]);
  return parseLumiere(html, {
    ...options,
    englishTitles: englishHtml ? parseEnglishTitles(englishHtml) : new Map(),
  });
}
