import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { enrichMoviesWithCsfd } from "../scraper/csfd.mjs";
import { enrichMoviesWithTmdb } from "../scraper/tmdb.mjs";
import { enrichMoviesWithOmdb } from "../scraper/omdb.mjs";
import { validateProgram } from "../scraper/schema.mjs";
import { ratingAudit } from "../scraper/rating-audit.mjs";

try { loadEnvFile(); } catch (error) { if (error.code !== "ENOENT") throw error; }
const path = "site/program.json";
const program = validateProgram(JSON.parse(await readFile(path, "utf8")));
const previousMovies = program.movies;
const diagnostics = [];
program.movies = await enrichMoviesWithCsfd(program.movies, { previousMovies,
  enabled: process.env.CSFD_ENABLED !== "false", cachePath: process.env.CSFD_CACHE_PATH });
program.movies = await enrichMoviesWithTmdb(program.movies, { previousMovies,
  apiKey: process.env.TMDB_API_KEY, cachePath: process.env.TMDB_CACHE_PATH });
program.movies = await enrichMoviesWithOmdb(program.movies, { previousMovies, diagnostics,
  apiKey: process.env.OMDB_API_KEY, cachePath: process.env.OMDB_CACHE_PATH });
validateProgram(program);
const report = ratingAudit(program.movies, diagnostics);
await mkdir(".cache", { recursive: true });
await writeFile(".cache/rating-audit.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(`${path}.tmp`, `${JSON.stringify(program, null, 2)}\n`, "utf8");
await rename(`${path}.tmp`, path);
console.log(JSON.stringify({ total: report.total, imdbRated: report.imdbRated,
  csfdRated: report.csfdRated, eitherRated: report.eitherRated }));
