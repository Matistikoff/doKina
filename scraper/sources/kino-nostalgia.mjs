import * as cheerio from "cheerio";
import { NOSTALGIA_PROGRAM_URL } from "../config.mjs";
import { cleanTitle, fetchBrowserHtml, languageDetails, movieId } from "../utils.mjs";

function decodeFlightData(html) {
  const $ = cheerio.load(html);
  let decoded = "";
  $("script:not([src])").each((_, script) => {
    const source = $(script).html() || "";
    const pattern = /self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/gu;
    for (const match of source.matchAll(pattern)) {
      try {
        decoded += JSON.parse(match[1]);
      } catch {
        // Ignore unrelated or incomplete Next.js flight chunks.
      }
    }
  });
  return decoded;
}

function extractJsonArrays(source, property) {
  const arrays = [];
  const marker = `"${property}":[`;
  let position = 0;
  while ((position = source.indexOf(marker, position)) >= 0) {
    const start = source.indexOf("[", position);
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
      } else if (character === '"') inString = true;
      else if (character === "[") depth += 1;
      else if (character === "]" && --depth === 0) {
        end = index + 1;
        break;
      }
    }
    if (end > start) {
      try {
        arrays.push(JSON.parse(source.slice(start, end)));
      } catch {
        // A later copy of the same property may still be complete.
      }
    }
    position = start + 1;
  }
  return arrays;
}

function slovak(value) {
  return value?.sk || value?.en || Object.values(value || {}).find(Boolean) || null;
}

export function parseEntradioEvents(html, {
  cinemaId,
  sourceId,
  programUrl,
  cinemaName,
}) {
  const eventMap = new Map();
  for (const events of extractJsonArrays(decodeFlightData(html), "events")) {
    for (const event of events) {
      if (!event?.id || !event?.startsAt || !event?.names) continue;
      const current = eventMap.get(event.id) || {};
      eventMap.set(event.id, { ...current, ...event });
    }
  }

  const moviesById = new Map();
  const screenings = [];
  for (const event of eventMap.values()) {
    const title = cleanTitle(slovak(event.names));
    const englishTitle = cleanTitle(event.names?.en || "");
    if (!title) continue;
    const showId = event.showId || event.show?.id;
    const id = movieId(title);
    const image = event.show?.primaryImage;
    const posterUrl = image?.thumbnails?.find((item) => item.size === "large")?.url || image?.url || null;
    const ageText = slovak(event.ageClassificationTranslated) || "";

    if (!moviesById.has(id)) {
      moviesById.set(id, {
        id,
        source: sourceId,
        externalId: showId ? String(showId) : null,
        title,
        originalTitle: englishTitle && englishTitle !== title ? englishTitle : null,
        releaseYear: null,
        durationMinutes: null,
        ageRating: ageText.match(/\b(\d{1,2})\b/u)?.[1] || null,
        genres: [],
        posterUrl,
        detailUrl: showId ? new URL(`/film/${showId}`, programUrl).href : null,
      });
    }

    const formatText = slovak(event.formatAbbreviationTranslated) || slovak(event.formatTranslated) || "";
    const available = event.availableSeatsCount;
    screenings.push({
      id: `${sourceId}-${event.id}`,
      source: sourceId,
      externalId: String(event.id),
      movieId: id,
      cinemaId,
      startsAt: event.startsAt,
      auditorium: event.auditorium?.name || null,
      format: formatText ? [formatText.replace(/\s+projekcia$/iu, "")] : [],
      languages: languageDetails(slovak(event.versionTranslated) || ""),
      price: null,
      soldOut: typeof available === "number" ? available === 0 : false,
      availabilityRatio: null,
      bookingUrl: event.ecommerceEventURL || event.thirdPartyPurchaseURL || null,
    });
  }

  if (screenings.length === 0) throw new Error(`${cinemaName} page contained no recognizable screenings`);
  return { movies: [...moviesById.values()], screenings };
}

export function parseNostalgia(html) {
  return parseEntradioEvents(html, {
    cinemaId: "nostalgia",
    sourceId: "kino-nostalgia",
    programUrl: NOSTALGIA_PROGRAM_URL,
    cinemaName: "Kino Nostalgia",
  });
}

export async function fetchNostalgia() {
  return parseNostalgia(await fetchBrowserHtml(NOSTALGIA_PROGRAM_URL));
}
