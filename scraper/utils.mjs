import { TIMEZONE } from "./config.mjs";

export function collapseWhitespace(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

export function localDateKey(date = new Date(), timeZone = TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function inferUpcomingDate(day, month, referenceDateKey) {
  const reference = new Date(`${referenceDateKey}T00:00:00Z`);
  const candidates = [-1, 0, 1, 2].map((offset) => {
    const year = reference.getUTCFullYear() + offset;
    const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { key, delta: new Date(`${key}T00:00:00Z`) - reference };
  });
  const future = candidates.filter(({ delta }) => delta >= -86_400_000).sort((a, b) => a.delta - b.delta);
  return (future[0] || candidates.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0]).key;
}

export function timezoneOffset(dateTime, timeZone = TIMEZONE) {
  const approximation = new Date(`${dateTime}Z`);
  const value = new Intl.DateTimeFormat("en", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(approximation).find((part) => part.type === "timeZoneName")?.value || "GMT+00:00";
  const match = value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return "+00:00";
  return `${match[1]}${match[2].padStart(2, "0")}:${match[3] || "00"}`;
}

export function zonedIso(dateKey, time, timeZone = TIMEZONE) {
  const local = `${dateKey}T${time.length === 5 ? `${time}:00` : time}`;
  return `${local}${timezoneOffset(local, timeZone)}`;
}

export function cleanTitle(value) {
  return collapseWhitespace(value)
    .replace(/\s*\|\s*(novinka|SENior kino|BABY kino|deťom|Filmotéka).*$/iu, "")
    .replace(/\s*\[[^\]]+\]\s*$/u, "")
    .replace(/\s*\(\s*\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?\s*€\s*\)\s*$/u, "")
    .replace(/\s*\(\s*\d+(?:st|nd|rd|th|\.)?\s*(?:výročie|anniversary)\s*\)\s*$/iu, "")
    .replace(/\s*(?:[-–—|]\s*)?\d+(?:st|nd|rd|th|\.)?\s*(?:výročie|anniversary)\s*$/iu, "")
    .replace(/\s+UKR\s*$/iu, "")
    .trim();
}

export function slug(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "film";
}

export function movieId(title, year) {
  return `movie-${slug(title)}${year ? `-${year}` : ""}`;
}

export function languageDetails(value = "") {
  const text = collapseWhitespace(value).toLocaleLowerCase("sk");
  const languages = { original: [], dubbed: [], voiceover: [], subtitles: [] };
  if (/slovensk(?:ý|y) dabing|\bsd\b/u.test(text)) languages.dubbed.push("sk");
  if (/česk(?:ý|y) dabing|\bčd\b/u.test(text)) languages.dubbed.push("cs");
  if (/slovensk(?:é|e) titulky|\bst\b/u.test(text)) languages.subtitles.push("sk");
  if (/česk(?:é|e) titulky|\bčt\b/u.test(text)) languages.subtitles.push("cs");
  return languages;
}

export async function fetchWithRetry(url, options = {}) {
  const { attempts = 3, timeoutMs = 15_000, ...fetchOptions } = options;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
          "User-Agent": "doKina.sk schedule aggregator (+https://github.com/)",
          ...fetchOptions.headers,
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Fetch failed for ${url}: ${lastError?.message || lastError}`);
}
