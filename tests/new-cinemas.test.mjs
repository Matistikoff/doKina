import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseFilmEurope } from "../scraper/sources/kino-film-europe.mjs";
import { parseLuky } from "../scraper/sources/kino-luky.mjs";
import { parseMladost } from "../scraper/sources/kino-mladost.mjs";
import { parseNostalgia } from "../scraper/sources/kino-nostalgia.mjs";
import { parseCinemawareDetails } from "../scraper/sources/cinemaware-table.mjs";

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("parses Film Europe and Mladosť Cinemaware schedules", async () => {
  const html = await fixture("cinemaware-table.html");
  const filmEurope = parseFilmEurope(html);
  const mladost = parseMladost(html);
  assert.equal(filmEurope.screenings[0].cinemaId, "film-europe");
  assert.equal(mladost.screenings[0].cinemaId, "mladost");
  assert.equal(mladost.screenings[0].startsAt, "2026-09-05T19:00:00+02:00");
  assert.deepEqual(mladost.screenings[0].languages.subtitles, ["cs"]);
  assert.equal(mladost.screenings[0].price, "7,00 €");
});

test("parses original titles from Cinemaware detail pages", () => {
  const details = parseCinemawareDetails(`
    <div class="film-platno-right">
      <p><b>L'Étranger</b></p>
      <p><b>Žáner: </b> Dráma &#8226; Krimi</p>
      <p><b>Dĺžka: </b> 120 minút (02:00)</p>
    </div>
  `);
  assert.deepEqual(details, {
    originalTitle: "L'Étranger",
    durationMinutes: 120,
    genres: ["Dráma", "Krimi"],
  });
});

test("parses Kino Lúky event cards", async () => {
  const result = parseLuky(await fixture("kino-luky.html"));
  assert.equal(result.movies[0].title, "CUDZINEC");
  assert.equal(result.movies[0].durationMinutes, 120);
  assert.equal(result.screenings[0].startsAt, "2026-09-05T19:00:00+02:00");
  assert.deepEqual(result.screenings[0].languages.subtitles, ["cs"]);
  assert.match(result.screenings[0].bookingUrl, /event-456/);
});

test("parses and de-duplicates Kino Nostalgia Next.js events", async () => {
  const result = parseNostalgia(await fixture("kino-nostalgia.html"));
  assert.equal(result.movies.length, 1);
  assert.equal(result.screenings.length, 1);
  assert.equal(result.movies[0].title, "Autá");
  assert.equal(result.movies[0].posterUrl, "https://images.example/poster.jpg");
  assert.equal(result.screenings[0].startsAt, "2026-09-05T13:00:00.000Z");
  assert.deepEqual(result.screenings[0].languages.dubbed, ["sk"]);
});

test("new cinema parsers reject pages without schedules", () => {
  assert.throws(() => parseMladost("<html></html>"), /no recognizable screenings/i);
  assert.throws(() => parseLuky("<html></html>"), /no recognizable screenings/i);
  assert.throws(() => parseNostalgia("<html></html>"), /no recognizable screenings/i);
});
