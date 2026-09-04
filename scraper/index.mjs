import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CINEMAS, OUTPUT_PATH, TIMEZONE } from "./config.mjs";
import { validateProgram } from "./schema.mjs";
import { fetchCinemaCity } from "./sources/cinema-city.mjs";
import { fetchLumiere } from "./sources/kino-lumiere.mjs";
import { fetchFilmEurope } from "./sources/kino-film-europe.mjs";
import { fetchLuky } from "./sources/kino-luky.mjs";
import { fetchMladost } from "./sources/kino-mladost.mjs";
import { fetchNostalgia } from "./sources/kino-nostalgia.mjs";
import { localDateKey } from "./utils.mjs";

function prefer(current, incoming) {
  if (!current) return incoming;
  const result = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    const currentValue = result[key];
    if (currentValue == null || currentValue === "" || (Array.isArray(currentValue) && currentValue.length === 0)) {
      if (value != null && value !== "" && (!Array.isArray(value) || value.length > 0)) result[key] = value;
    }
  }
  return result;
}

export function assembleProgram(results, generatedAt = new Date().toISOString(), sources = null) {
  const movieMap = new Map();
  const screeningMap = new Map();
  for (const result of results) {
    result.movies.forEach((movie) => movieMap.set(movie.id, prefer(movieMap.get(movie.id), movie)));
    result.screenings.forEach((screening) => screeningMap.set(screening.id, screening));
  }

  const screenings = [...screeningMap.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.cinemaId.localeCompare(b.cinemaId));
  const usedMovieIds = new Set(screenings.map((screening) => screening.movieId));
  const movies = [...movieMap.values()]
    .filter((movie) => usedMovieIds.has(movie.id))
    .sort((a, b) => a.title.localeCompare(b.title, "sk"));

  return validateProgram({
    schemaVersion: 1,
    generatedAt,
    timezone: TIMEZONE,
    sources: sources || [...new Set(CINEMAS.map((cinema) => cinema.sourceId))]
      .map((id) => ({ id, status: "ok", fetchedAt: generatedAt })),
    cinemas: CINEMAS.map(({ externalId: _externalId, sourceId: _sourceId, ...cinema }) => cinema),
    movies,
    screenings,
  });
}

async function main() {
  const today = localDateKey();
  const cinemaCityCinemas = CINEMAS.filter((cinema) => cinema.sourceId === "cinema-city");
  console.log(`Fetching schedules from ${today}…`);
  const jobs = [
    { sourceId: "kino-lumiere", promise: fetchLumiere({ referenceDate: today }) },
    ...cinemaCityCinemas.map((cinema) => ({
      sourceId: "cinema-city",
      promise: fetchCinemaCity(cinema, { today, daysAhead: 10 }),
    })),
    { sourceId: "kino-film-europe", promise: fetchFilmEurope() },
    { sourceId: "kino-mladost", promise: fetchMladost() },
    { sourceId: "kino-luky", promise: fetchLuky() },
    { sourceId: "kino-nostalgia", promise: fetchNostalgia() },
  ];
  const settled = await Promise.allSettled(jobs.map((job) => job.promise));
  const results = [];
  const sourceErrors = new Map();
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") results.push(result.value);
    else {
      const sourceId = jobs[index].sourceId;
      sourceErrors.set(sourceId, result.reason?.message || String(result.reason));
      console.error(`${sourceId}: ${sourceErrors.get(sourceId)}`);
    }
  });
  if (results.length === 0) throw new Error("Every cinema source failed; keeping the previous programme");

  const generatedAt = new Date().toISOString();
  const sources = [...new Set(CINEMAS.map((cinema) => cinema.sourceId))].map((id) => ({
    id,
    status: sourceErrors.has(id) ? "error" : "ok",
    fetchedAt: generatedAt,
    ...(sourceErrors.has(id) ? { error: sourceErrors.get(id) } : {}),
  }));
  const program = assembleProgram(results, generatedAt, sources);
  const output = fileURLToPath(OUTPUT_PATH);
  const temporary = `${output}.tmp`;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(program, null, 2)}\n`, "utf8");
  await rename(temporary, output);
  console.log(`Wrote ${program.screenings.length} screenings and ${program.movies.length} films to ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
