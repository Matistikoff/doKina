import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadEnvFile } from "node:process";
import { CINEMAS, OUTPUT_PATH, TIMEZONE } from "./config.mjs";
import { validateProgram } from "./schema.mjs";
import { fetchLumiere } from "./sources/kino-lumiere.mjs";
import { fetchFilmEurope } from "./sources/kino-film-europe.mjs";
import { fetchLuky } from "./sources/kino-luky.mjs";
import { fetchMladost } from "./sources/kino-mladost.mjs";
import { fetchNostalgia } from "./sources/kino-nostalgia.mjs";
import { fetchEdison } from "./sources/edison-filmhub.mjs";
import { fetchNovaCvernovka } from "./sources/nova-cvernovka.mjs";
import { fetchA4KinoInak } from "./sources/a4-kino-inak.mjs";
import { localDateKey } from "./utils.mjs";
import { enrichMoviesWithTmdb } from "./tmdb.mjs";
import { enrichMoviesWithOmdb } from "./omdb.mjs";
import { deduplicateMovies } from "./deduplicate.mjs";
import { applyMovieHistory, readMovieHistory, writeMovieHistory } from "./movie-history.mjs";

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

  return validateProgram(deduplicateMovies({
    schemaVersion: 1,
    generatedAt,
    timezone: TIMEZONE,
    sources: sources || [...new Set(CINEMAS.map((cinema) => cinema.sourceId))]
      .map((id) => ({ id, status: "ok", fetchedAt: generatedAt })),
    cinemas: CINEMAS.map(({ externalId: _externalId, sourceId: _sourceId, ...cinema }) => cinema),
    movies,
    screenings,
  }));
}

async function main() {
  try {
    loadEnvFile();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let previousProgram = null;
  try {
    previousProgram = validateProgram(JSON.parse(await readFile(OUTPUT_PATH, "utf8")));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const previousMovies = previousProgram?.movies || [];
  const movieHistoryPath = process.env.MOVIE_HISTORY_PATH || ".cache/movie-history.json";
  const movieHistory = await readMovieHistory(movieHistoryPath);
  const today = localDateKey();
  console.log(`Fetching schedules from ${today}…`);
  const jobs = [
    { sourceId: "kino-lumiere", promise: fetchLumiere({ referenceDate: today }) },
    { sourceId: "kino-film-europe", promise: fetchFilmEurope() },
    { sourceId: "kino-mladost", promise: fetchMladost() },
    { sourceId: "kino-luky", promise: fetchLuky() },
    { sourceId: "kino-nostalgia", promise: fetchNostalgia() },
    { sourceId: "edison-filmhub", promise: fetchEdison({ referenceDate: today }) },
    { sourceId: "nova-cvernovka", promise: fetchNovaCvernovka() },
    { sourceId: "a4-kino-inak", promise: fetchA4KinoInak() },
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
  let program = assembleProgram(results, generatedAt, sources);
  program.movies = await enrichMoviesWithTmdb(program.movies, {
    apiKey: process.env.TMDB_API_KEY,
    cachePath: process.env.TMDB_CACHE_PATH,
    previousMovies,
  });
  program.movies = await enrichMoviesWithOmdb(program.movies, {
    apiKey: process.env.OMDB_API_KEY,
    cachePath: process.env.OMDB_CACHE_PATH,
    previousMovies,
  });
  program = validateProgram(deduplicateMovies(program));
  const tracked = applyMovieHistory(program.movies, {
    generatedAt,
    previousGeneratedAt: previousProgram?.generatedAt,
    previousMovies,
    history: movieHistory,
  });
  program.movies = tracked.movies;
  program = validateProgram(program);
  const output = fileURLToPath(OUTPUT_PATH);
  const temporary = `${output}.tmp`;
  await mkdir(dirname(output), { recursive: true });
  await writeMovieHistory(movieHistoryPath, tracked.history);
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
