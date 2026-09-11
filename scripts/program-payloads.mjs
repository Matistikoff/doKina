import { createHash } from "node:crypto";

// Keep filtering, sorting and card metadata in the index. The complete
// program.json remains available for the Worker's social previews.
const DETAIL_FIELDS = [
  "overview", "overviewLanguage", "cast", "actors", "backdropUrl",
  "trailerUrl", "budgetUsd", "worldwideGrossUsd",
];

export function programPayloads(program) {
  const details = new Map();
  const movies = program.movies.map((movie) => {
    const summary = { ...movie };
    const detail = { id: movie.id };
    for (const field of DETAIL_FIELDS) {
      if (Object.hasOwn(movie, field)) detail[field] = movie[field];
      delete summary[field];
    }
    const body = JSON.stringify(detail);
    const hash = createHash("sha256").update(body).digest("hex");
    summary.detailDataUrl = `/movie-details/${hash}.json`;
    details.set(summary.detailDataUrl, body);
    return summary;
  });
  return { index: { ...program, movies }, details };
}
