import * as cheerio from "cheerio";
import { LUKY_PROGRAM_URL, TIMEZONE } from "../config.mjs";
import { collapseWhitespace, fetchWithRetry, languageDetails, movieId, zonedIso } from "../utils.mjs";

function absoluteUrl(value) {
  if (!value || value === "#") return null;
  return new URL(value.replaceAll("\\/", "/").replaceAll("\\.", "."), LUKY_PROGRAM_URL).href;
}

function filmTitle(value) {
  return collapseWhitespace(value)
    .replace(/^(?:Kino pre deti|Klenoty žánrového filmu|Ozveny svetových festivalov|Filmový klub)\s*:\s*/iu, "")
    .replace(/\s*\(FK\)\s*$/iu, "")
    .trim();
}

export function parseLuky(html) {
  const $ = cheerio.load(html);
  const moviesById = new Map();
  const screenings = [];

  $(".event-card").each((_, card) => {
    const venue = collapseWhitespace($(card).find(".place-dom-kultury-luky").first().text());
    if (!/Dom kultúry Lúky/iu.test(venue)) return;

    const titleLink = $(card).find("h5 a").first();
    const title = filmTitle(titleLink.attr("title") || titleLink.text());
    const dateTime = collapseWhitespace($(card).find(".fa-calendar-alt").parent().text());
    const match = dateTime.match(/(\d{2})\.(\d{2})\.(\d{4})\s*\|\s*(\d{1,2}:\d{2})/u);
    if (!title || !match) return;

    const date = `${match[3]}-${match[2]}-${match[1]}`;
    const details = collapseWhitespace($(card).find(".pt-3 > p").last().text());
    const releaseYear = details.match(/\b((?:19|20)\d{2})\b/u)?.[1] || null;
    const durationMinutes = Number(details.match(/\b(\d{2,3})\s*min\.?/iu)?.[1]) || null;
    const ageRating = collapseWhitespace($(card).find(".jso-age").first().text()) || null;
    const detailUrl = absoluteUrl(titleLink.attr("href"));
    const bookingUrl = absoluteUrl($(card).find("a.btn-danger").attr("href"));
    const externalId = bookingUrl?.match(/event-detail\/([^/?]+)/u)?.[1]
      || detailUrl?.match(/\/podujatie\/([^?]+)/u)?.[1]
      || `${date}-${match[4]}-${movieId(title)}`;
    const imageStyle = $(card).find(".img-place").attr("style") || "";
    const posterUrl = absoluteUrl(imageStyle.match(/url\(([^)]+)\)/u)?.[1]?.replace(/^['"]|['"]$/gu, ""));
    const id = movieId(title, releaseYear);

    if (!moviesById.has(id)) {
      moviesById.set(id, {
        id,
        source: "kino-luky",
        externalId: detailUrl?.match(/\/podujatie\/([^?]+)/u)?.[1] || null,
        title,
        originalTitle: null,
        releaseYear,
        durationMinutes,
        ageRating,
        genres: [],
        posterUrl,
        detailUrl,
      });
    }

    screenings.push({
      id: `kino-luky-${externalId}`,
      source: "kino-luky",
      externalId,
      movieId: id,
      cinemaId: "luky",
      startsAt: zonedIso(date, match[4], TIMEZONE),
      auditorium: venue,
      format: [],
      languages: languageDetails(details),
      price: null,
      soldOut: false,
      availabilityRatio: null,
      bookingUrl,
    });
  });

  if (screenings.length === 0) throw new Error("Kino Lúky page contained no recognizable screenings");
  return { movies: [...moviesById.values()], screenings };
}

export async function fetchLuky() {
  const firstHtml = await (await fetchWithRetry(LUKY_PROGRAM_URL)).text();
  const $ = cheerio.load(firstHtml);
  const lastPage = Math.min(20, Math.max(1, ...$(".pagination a[href*='paginator-page=']").map((_, link) => {
    const href = $(link).attr("href");
    return Number(new URL(href, LUKY_PROGRAM_URL).searchParams.get("paginator-page")) || 1;
  }).get()));
  const remainingHtml = await Promise.all(Array.from({ length: lastPage - 1 }, async (_, index) => {
    const url = new URL(LUKY_PROGRAM_URL);
    url.searchParams.set("paginator-page", String(index + 2));
    url.searchParams.set("do", "paginator-list");
    return (await fetchWithRetry(url)).text();
  }));
  const results = [firstHtml, ...remainingHtml].map(parseLuky);
  return {
    movies: [...new Map(results.flatMap((result) => result.movies).map((movie) => [movie.id, movie])).values()],
    screenings: [...new Map(results.flatMap((result) => result.screenings).map((screening) => [screening.id, screening])).values()],
  };
}
