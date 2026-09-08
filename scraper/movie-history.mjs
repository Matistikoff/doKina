import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { moviesMatch } from "./deduplicate.mjs";

const IDENTITY_FIELDS = [
  "id",
  "title",
  "originalTitle",
  "englishTitle",
  "releaseYear",
  "directors",
  "durationMinutes",
  "imdbId",
  "tmdbId",
];

function identity(movie, firstSeenAt) {
  const entry = { firstSeenAt };
  for (const field of IDENTITY_FIELDS) {
    if (movie[field] != null) entry[field] = movie[field];
  }
  return entry;
}

function sameMovie(a, b) {
  if (a.imdbId && b.imdbId && a.imdbId === b.imdbId) return true;
  if (a.tmdbId && b.tmdbId && a.tmdbId === b.tmdbId) return true;
  if (a.id && b.id && a.id === b.id) return true;
  return moviesMatch(a, b);
}

function validDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function earlierDate(a, b) {
  if (!validDate(a)) return b;
  if (!validDate(b)) return a;
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

function addKnownMovie(knownMovies, movie, fallbackFirstSeenAt) {
  const firstSeenAt = validDate(movie.firstSeenAt) ? movie.firstSeenAt : fallbackFirstSeenAt;
  if (!validDate(firstSeenAt)) return;
  const match = knownMovies.findIndex((known) => sameMovie(known, movie));
  if (match === -1) {
    knownMovies.push(identity(movie, firstSeenAt));
    return;
  }
  const oldest = earlierDate(knownMovies[match].firstSeenAt, firstSeenAt);
  knownMovies[match] = { ...knownMovies[match], ...identity(movie, oldest), firstSeenAt: oldest };
}

export function applyMovieHistory(movies, options) {
  const { generatedAt, previousGeneratedAt, previousMovies = [], history = {} } = options;
  const knownMovies = Array.isArray(history.movies)
    ? history.movies.filter((movie) => validDate(movie.firstSeenAt)).map((movie) => ({ ...movie }))
    : [];

  for (const movie of previousMovies) addKnownMovie(knownMovies, movie, previousGeneratedAt);

  const moviesWithHistory = movies.map((movie) => {
    const known = knownMovies.filter((candidate) => sameMovie(candidate, movie));
    const firstSeenAt = known.reduce(
      (oldest, candidate) => earlierDate(oldest, candidate.firstSeenAt),
      generatedAt,
    );
    addKnownMovie(knownMovies, movie, firstSeenAt);
    return { ...movie, firstSeenAt };
  });

  return {
    movies: moviesWithHistory,
    history: {
      version: 1,
      movies: knownMovies.sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt) || a.title.localeCompare(b.title, "sk")),
    },
  };
}

export async function readMovieHistory(cachePath) {
  try {
    const history = JSON.parse(await readFile(cachePath, "utf8"));
    return history?.version === 1 && Array.isArray(history.movies) ? history : { version: 1, movies: [] };
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return { version: 1, movies: [] };
    throw error;
  }
}

export async function writeMovieHistory(cachePath, history) {
  await mkdir(dirname(cachePath), { recursive: true });
  const temporary = `${cachePath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(history, null, 2)}\n`, "utf8");
  await rename(temporary, cachePath);
}
