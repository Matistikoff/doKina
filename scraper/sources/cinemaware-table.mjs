import * as cheerio from "cheerio";
import { TIMEZONE } from "../config.mjs";
import { cleanTitle, collapseWhitespace, fetchWithRetry, languageDetails, movieId, zonedIso } from "../utils.mjs";

function absoluteUrl(value, baseUrl) {
  if (!value || value === "#") return null;
  return new URL(value, baseUrl).href;
}

function bookingId(url) {
  if (!url) return null;
  return new URL(url).searchParams.get("id");
}

export function parseCinemawareTable(html, cinema, options = {}) {
  const sourceId = cinema.sourceId;
  const baseUrl = options.baseUrl || cinema.url;
  const $ = cheerio.load(html);
  const moviesById = new Map();
  const screenings = [];

  $("div[id^='den_']").each((_, day) => {
    const date = $(day).attr("id")?.match(/^den_(\d{4}-\d{2}-\d{2})$/)?.[1];
    if (!date) return;

    $(day).find("table.program2 tr").each((__, row) => {
      const movieLink = $(row).find("td.name a").first();
      const title = cleanTitle(movieLink.text());
      const detailUrl = absoluteUrl(movieLink.attr("href"), baseUrl);
      if (!title) return;

      const id = movieId(title);
      const externalId = detailUrl?.match(/film-(\d+)/)?.[1] || null;
      const labels = $(row).find("td.icons .btn").map((___, item) => collapseWhitespace($(item).attr("title") || $(item).text())).get();
      const format = $(row).find("td.icons [class*='frmt_']").map((___, item) => collapseWhitespace($(item).text())).get().filter(Boolean);
      const ageText = collapseWhitespace($(row).find("td.icons .age").first().text());
      const languageText = labels.join(" ");
      const price = collapseWhitespace($(row).find("td.ceny-time .ceny").first().text()) || null;

      if (!moviesById.has(id)) {
        moviesById.set(id, {
          id,
          source: sourceId,
          externalId,
          title,
          originalTitle: null,
          releaseYear: null,
          durationMinutes: null,
          ageRating: ageText || null,
          genres: [],
          posterUrl: null,
          detailUrl,
        });
      }

      $(row).find("td.ceny-time .time a").each((___, timeLink) => {
        const time = collapseWhitespace($(timeLink).text()).match(/\d{1,2}:\d{2}/)?.[0];
        const bookingUrl = absoluteUrl($(timeLink).attr("href"), baseUrl);
        if (!time) return;
        const eventId = bookingId(bookingUrl) || `${date}-${time}-${id}`;
        screenings.push({
          id: `${sourceId}-${eventId}`,
          source: sourceId,
          externalId: eventId,
          movieId: id,
          cinemaId: cinema.id,
          startsAt: zonedIso(date, time, TIMEZONE),
          auditorium: $(timeLink).attr("title")?.split(/\r?\n/u).at(-1)?.trim() || null,
          format,
          languages: languageDetails(languageText),
          price,
          soldOut: /vypredan/iu.test($(timeLink).attr("title") || ""),
          availabilityRatio: null,
          bookingUrl,
        });
      });
    });
  });

  if (screenings.length === 0) throw new Error(`${cinema.name} page contained no recognizable screenings`);
  return { movies: [...moviesById.values()], screenings };
}

export async function fetchCinemawareTable(cinema, programUrl) {
  const html = await (await fetchWithRetry(programUrl)).text();
  return parseCinemawareTable(html, cinema, { baseUrl: programUrl });
}
