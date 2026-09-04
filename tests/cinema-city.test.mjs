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
