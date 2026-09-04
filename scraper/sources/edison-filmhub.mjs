import * as cheerio from "cheerio";
import { EDISON_EN_URL, EDISON_PROGRAM_EN_URL, EDISON_PROGRAM_URL, TIMEZONE } from "../config.mjs";
import {
  cleanTitle,
  collapseWhitespace,
  fetchWithRetry,
  inferUpcomingDate,
  localDateKey,
  movieId,
  zonedIso,
} from "../utils.mjs";

function absoluteUrl(value, baseUrl = EDISON_PROGRAM_URL) {
  if (!value || value.trim() === "#") return null;
  return new URL(value.trim(), baseUrl).href;
}

function eventId(value) {
  if (!value) return null;
  return new URL(value.trim(), EDISON_PROGRAM_URL).searchParams.get("ent_id");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseLanguages(value) {
  const lower = collapseWhitespace(value).toLocaleLowerCase("sk");
  const original = [];
  const languageNames = [
    ["slovenčina", "sk"], ["slovak", "sk"],
    ["čeština", "cs"], ["czech", "cs"],
    ["angličtina", "en"], ["english", "en"],
    ["francúzština", "fr"], ["french", "fr"],
    ["nemčina", "de"], ["german", "de"],
    ["španielčina", "es"], ["spanish", "es"],
    ["taliančina", "it"], ["italian", "it"],
    ["poľština", "pl"], ["polish", "pl"],
    ["dánčina", "da"], ["danish", "da"],
    ["švédčina", "sv"], ["swedish", "sv"],
    ["hebrejčina", "he"], ["hebrew", "he"],
  ];
  for (const [name, code] of languageNames) {
    if (lower.includes(name)) original.push(code);
  }

  const dubbed = [];
  if (/(?:sk|slovensk(?:ý|y)|slovak)\s*(?:dabing|dubbed)/u.test(lower)) dubbed.push("sk");
  if (/(?:cz|česk(?:ý|y)|czech)\s*(?:dabing|dubbed)/u.test(lower)) dubbed.push("cs");

  const subtitles = [];
  const subtitleText = lower.match(/(?:tit\.|titulky|sub\.|subtitles?)\s*([^;|]+)/u)?.[1] || "";
  if (/\b(?:sk|slovak)\b/u.test(subtitleText)) subtitles.push("sk");
  if (/\b(?:cz|cs|czech)\b/u.test(subtitleText)) subtitles.push("cs");
  if (/\b(?:en|english)\b/u.test(subtitleText)) subtitles.push("en");

  return {
    original: unique(original),
    dubbed: unique(dubbed),
    voiceover: [],
    subtitles: unique(subtitles),
  };
}

export function parseEdisonEnglishTitles(html) {
  const $ = cheerio.load(html);
  const titles = new Map();
  let screeningIndex = 0;
  $(".program_module .program_cont > .line").each((_, row) => {
    const titleLink = $(row).find("a.title").first();
    const title = cleanTitle(titleLink.text());
    if (!title || !collapseWhitespace($(row).find(".cas").first().text())) return;
    const id = eventId($(row).find(".btns a.btn[href*='ent_id=']").attr("href"));
    if (id && title) titles.set(id, title);
    const detailUrl = absoluteUrl(titleLink.attr("href"));
    if (detailUrl && title) titles.set(`path:${new URL(detailUrl).pathname}`, title);
    titles.set(`row:${screeningIndex}`, title);
    screeningIndex += 1;
  });
  return titles;
}

export function parseEdisonDetails(html, baseUrl = EDISON_PROGRAM_URL) {
  const $ = cheerio.load(html);
  let movie = null;
  $("script[type='application/ld+json']").each((_, script) => {
    if (movie) return;
    try {
      const value = JSON.parse($(script).html());
      if (value?.["@type"] === "Movie") movie = value;
    } catch {
      // Ignore unrelated malformed data.
    }
  });
  if (!movie) return {};
  const genres = Array.isArray(movie.genre) ? movie.genre : movie.genre ? [movie.genre] : [];
  const directors = Array.isArray(movie.director)
    ? movie.director.map((item) => item?.name || item)
    : [movie.director?.name || movie.director].filter(Boolean);
  const ageRating = $(".film_page .pristupnost img").first().attr("src")?.match(/\/(\d{1,2})\.svg$/u)?.[1] || null;
  return {
    originalTitle: collapseWhitespace(movie.alternateName || "") || null,
    releaseYear: String(movie.dateCreated || "").match(/(?:19|20)\d{2}/u)?.[0] || null,
    directors,
    durationMinutes: Number(String(movie.duration || "").match(/\d{1,3}/u)?.[0]) || null,
    ageRating,
    genres: genres.map((item) => collapseWhitespace(String(item))).filter(Boolean),
    posterUrl: absoluteUrl(typeof movie.image === "string" ? movie.image : movie.image?.url, baseUrl),
  };
}

export function parseEdison(html, options = {}) {
  const referenceDate = options.referenceDate || localDateKey();
  const englishTitles = options.englishTitles || new Map();
  const $ = cheerio.load(html);
  const moviesById = new Map();
  const screenings = [];
  let date = null;
  let screeningIndex = 0;

  $(".program_module .program_cont > .line").each((_, row) => {
    const dateMatch = collapseWhitespace($(row).find(".day").first().text()).match(/(\d{1,2})\.\s*(\d{1,2})\./u);
    if (dateMatch) {
      date = inferUpcomingDate(Number(dateMatch[1]), Number(dateMatch[2]), referenceDate);
      return;
    }

    const time = collapseWhitespace($(row).find(".cas").first().text()).match(/\d{1,2}[.:]\d{2}/u)?.[0]?.replace(".", ":");
    const titleLink = $(row).find("a.title").first();
    const title = cleanTitle(titleLink.text());
    if (!date || !time || !title) return;

    const detailUrl = absoluteUrl(titleLink.attr("href"));
    const bookingLink = $(row).find(".btns a.btn[href*='ent_id=']").first();
    const bookingUrl = absoluteUrl(bookingLink.attr("href"));
    const externalId = eventId(bookingUrl) || `${date}-${time}-${movieId(title)}`;
    const id = movieId(title);
    const description = $(row).find(".desc").first();
    const auditorium = collapseWhitespace(description.find("b").first().text()) || null;
    const languageText = collapseWhitespace(description.clone().find("div").remove().end().text());
    const disabled = $(row).find(".btns .btn.disabled").length > 0;
    const priceText = collapseWhitespace(bookingLink.text());

    if (!moviesById.has(id)) {
      moviesById.set(id, {
        id,
        source: "edison-filmhub",
        externalId: detailUrl ? new URL(detailUrl).pathname.split("/").filter(Boolean).at(-1) : null,
        title,
        englishTitle: englishTitles.get(String(externalId))
          || (detailUrl ? englishTitles.get(`path:${new URL(detailUrl).pathname}`) : null)
          || englishTitles.get(`row:${screeningIndex}`)
          || null,
        originalTitle: null,
        releaseYear: null,
        directors: [],
        durationMinutes: null,
        ageRating: null,
        genres: [],
        posterUrl: null,
        detailUrl,
      });
    }

    screenings.push({
      id: `edison-filmhub-${externalId}`,
      source: "edison-filmhub",
      externalId: String(externalId),
      movieId: id,
      cinemaId: "edison-filmhub",
      startsAt: zonedIso(date, time, TIMEZONE),
      auditorium,
      format: [],
      languages: parseLanguages(languageText),
      price: priceText && !disabled ? priceText : null,
      soldOut: disabled,
      availabilityRatio: null,
      bookingUrl,
    });
    screeningIndex += 1;
  });

  if (screenings.length === 0) throw new Error("Edison Filmhub page contained no recognizable screenings");
  return { movies: [...moviesById.values()], screenings };
}

async function fetchEnglishProgramme() {
  const localeResponse = await fetchWithRetry(EDISON_EN_URL);
  const sessionCookie = localeResponse.headers.get("set-cookie")?.split(";", 1)[0];
  return (await fetchWithRetry(EDISON_PROGRAM_EN_URL, {
    headers: {
      "Accept-Language": "en-GB,en;q=0.9",
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    },
  })).text();
}

export async function fetchEdison(options = {}) {
  const [html, englishHtml] = await Promise.all([
    fetchWithRetry(EDISON_PROGRAM_URL).then((response) => response.text()),
    fetchEnglishProgramme().catch((error) => {
      console.warn(`Edison Filmhub English programme unavailable: ${error.message}`);
      return null;
    }),
  ]);
  const result = parseEdison(html, {
    ...options,
    englishTitles: englishHtml ? parseEdisonEnglishTitles(englishHtml) : new Map(),
  });
  result.movies = await Promise.all(result.movies.map(async (movie) => {
    if (!movie.detailUrl) return movie;
    try {
      const detailHtml = await (await fetchWithRetry(movie.detailUrl)).text();
      return { ...movie, ...parseEdisonDetails(detailHtml, movie.detailUrl) };
    } catch (error) {
      console.warn(`Edison Filmhub details unavailable for “${movie.title}”: ${error.message}`);
      return movie;
    }
  }));
  return result;
}
