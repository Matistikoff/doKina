import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseCinemaCity } from "../scraper/sources/cinema-city.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/cinema-city.json", import.meta.url), "utf8"));
const cinema = { id: "cc-eurovea", externalId: "1012", name: "Cinema City Eurovea" };

test("parses Cinema City JSON into normalized movies and screenings", () => {
  const result = parseCinemaCity(fixture, cinema);
  assert.equal(result.movies.length, 1);
  assert.deepEqual(result.movies[0], {
    id: "movie-bojovnik-2026",
    source: "cinema-city",
    externalId: "7842d3x1",
    title: "Bojovník",
    originalTitle: null,
    releaseYear: "2026",
    durationMinutes: 123,
    ageRating: "15+",
    genres: ["Dráma", "Športový"],
    posterUrl: "https://example.com/bojovnik.jpg",
    detailUrl: "https://www.cinemacity.sk/films/bojovnik/7842d3x1"
  });
  assert.equal(result.screenings[0].startsAt, "2026-09-04T18:20:00+02:00");
  assert.equal(result.screenings[0].auditorium, "Sála 9");
  assert.deepEqual(result.screenings[0].format, ["2D", "Dolby Atmos"]);
  assert.equal(result.screenings[0].bookingUrl.includes("96455"), true);
});

test("rejects an unexpected Cinema City response", () => {
  assert.throws(() => parseCinemaCity({}, cinema), /Unexpected Cinema City response/);
});

test("uses English Cinema City titles and removes presentation labels", () => {
  const payload = structuredClone(fixture);
  payload.body.films[0].id = "2077s3i1";
  payload.body.films[0].name = "Autá (20. výročie)";
  payload.body.films[0].releaseYear = "2006";
  payload.body.events[0].filmId = "2077s3i1";

  const result = parseCinemaCity(payload, cinema, new Map([["2077s3i1", "Cars (20th anniversary)"]]));

  assert.equal(result.movies[0].id, "movie-auta-2006");
  assert.equal(result.movies[0].title, "Autá");
  assert.equal(result.movies[0].originalTitle, "Cars");
  assert.equal(result.screenings[0].movieId, "movie-auta-2006");
});

test("normalizes language suffixes while retaining the original English title", () => {
  const payload = structuredClone(fixture);
  payload.body.films[0].id = "8085s2r1";
  payload.body.films[0].name = "Spider-Man: Nový deň UKR";
  payload.body.events[0].filmId = "8085s2r1";

  const result = parseCinemaCity(payload, cinema, new Map([["8085s2r1", "Spider-Man: Brand New Day UKR"]]));

  assert.equal(result.movies[0].title, "Spider-Man: Nový deň");
  assert.equal(result.movies[0].originalTitle, "Spider-Man: Brand New Day");
  assert.equal(result.screenings[0].movieId, "movie-spider-man-novy-den-2026");
});
