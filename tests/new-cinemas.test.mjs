import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseFilmEurope } from "../scraper/sources/kino-film-europe.mjs";
import { parseLuky } from "../scraper/sources/kino-luky.mjs";
import { parseMladost } from "../scraper/sources/kino-mladost.mjs";
import { parseNostalgia } from "../scraper/sources/kino-nostalgia.mjs";
import { parseCinemawareDetails } from "../scraper/sources/cinemaware-table.mjs";
import { parseEdison, parseEdisonDetails, parseEdisonEnglishTitles } from "../scraper/sources/edison-filmhub.mjs";
import {
  parseNovaCvernovka,
  parseNovaCvernovkaDetails,
  parseNovaCvernovkaEnglishTitles,
} from "../scraper/sources/nova-cvernovka.mjs";
import {
  parseA4EnglishTitles,
  parseA4KinoInak,
  parseA4KinoInakDetails,
} from "../scraper/sources/a4-kino-inak.mjs";

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("parses Mladosť Cinemaware schedules", async () => {
  const html = await fixture("cinemaware-table.html");
  const mladost = parseMladost(html);
  assert.equal(mladost.screenings[0].cinemaId, "mladost");
  assert.equal(mladost.screenings[0].startsAt, "2026-09-05T19:00:00+02:00");
  assert.deepEqual(mladost.screenings[0].languages.subtitles, ["cs"]);
  assert.equal(mladost.screenings[0].price, "7,00 €");
});

test("parses Film Europe Next.js events", async () => {
  const result = parseFilmEurope(await fixture("kino-nostalgia.html"));
  assert.equal(result.movies[0].title, "Autá");
  assert.equal(result.movies[0].source, "kino-film-europe");
  assert.equal(result.screenings[0].cinemaId, "film-europe");
  assert.equal(result.screenings[0].source, "kino-film-europe");
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

test("parses Edison Filmhub schedules and pairs official English titles", async () => {
  const html = await fixture("edison-filmhub.html");
  const englishHtml = html.replaceAll("CUDZINEC", "THE STRANGER");
  const result = parseEdison(html, {
    referenceDate: "2026-09-04",
    englishTitles: parseEdisonEnglishTitles(englishHtml),
  });
  assert.equal(result.movies.length, 1);
  assert.equal(result.movies[0].englishTitle, "THE STRANGER");
  assert.equal(result.screenings[0].startsAt, "2026-09-05T20:00:00+02:00");
  assert.equal(result.screenings[0].auditorium, "Malá sála");
  assert.deepEqual(result.screenings[0].languages.original, ["fr"]);
  assert.deepEqual(result.screenings[0].languages.subtitles, ["cs", "en"]);
  assert.equal(result.screenings[1].soldOut, true);
});

test("parses Edison Filmhub schema.org movie details", () => {
  const details = parseEdisonDetails(`
    <div class="film_page"><div class="pristupnost"><img src="/TEMPLATE/IMG/LEGAL/15.svg"></div></div>
    <script type="application/ld+json">{
      "@type":"Movie", "alternateName":"L'Étranger", "dateCreated":"2025",
      "duration":"120", "genre":["Krimi","Dráma"],
      "image":"/poster.jpg", "director":{"@type":"Person","name":"François Ozon"}
    }</script>
  `, "https://edisonfilmhub.sk/filmy/cudzinec");
  assert.equal(details.originalTitle, "L'Étranger");
  assert.equal(details.releaseYear, "2025");
  assert.equal(details.posterUrl, "https://edisonfilmhub.sk/poster.jpg");
  assert.equal(details.ageRating, "15");
  assert.deepEqual(details.genres, ["Krimi", "Dráma"]);
});

test("parses Nová Cvernovka film events and pairs localized English titles", async () => {
  const html = await fixture("nova-cvernovka.html");
  const englishHtml = html.replace(
    "Kino pod Palmou | Parazit (Bong Joon-ho, 2019)",
    "Parasite (Bong Joon-ho, 2019)",
  );
  const result = parseNovaCvernovka(html, {
    englishTitles: parseNovaCvernovkaEnglishTitles(englishHtml),
  });
  assert.equal(result.movies.length, 1);
  assert.equal(result.movies[0].title, "Parazit");
  assert.equal(result.movies[0].englishTitle, "Parasite");
  assert.equal(result.movies[0].releaseYear, "2019");
  assert.equal(result.screenings[0].cinemaId, "nova-cvernovka");
  assert.equal(result.screenings[0].startsAt, "2026-09-06T20:30:00+02:00");
});

test("accepts a valid Nová Cvernovka programme without film screenings", () => {
  const result = parseNovaCvernovka(`
    <main>
      <article class="infinite-scroll-item tag-workshop" data-start="20260910" id="post-24277">
        <div class="FilterItem__date-container"><div>10/09</div><div>17:30</div></div>
        <h3 class="entry-title">Tvorivý komunitný večer</h3>
      </article>
    </main>
  `);
  assert.deepEqual(result, { movies: [], screenings: [] });
});

test("parses Nová Cvernovka detail metadata", () => {
  const details = parseNovaCvernovkaDetails(`
    <article>
      <div class="event-places">Park</div>
      <div class="entry-content">Južná Kórea | 2019 | 132 min. Film v anglickom znení s českými titulkami.</div>
      <div class="entry-vstupne"><a href="/listky/24289">Predpredaj</a></div>
    </article>
  `, "https://novacvernovka.eu/program/parazit");
  assert.equal(details.releaseYear, "2019");
  assert.equal(details.durationMinutes, 132);
  assert.equal(details.auditorium, "Park");
  assert.equal(details.bookingUrl, "https://novacvernovka.eu/listky/24289");
  assert.deepEqual(details.languages.original, ["en"]);
  assert.deepEqual(details.languages.subtitles, ["cs"]);
});

test("parses A4 Kino inak and pairs its official English title", async () => {
  const html = await fixture("a4-kino-inak.html");
  const englishHtml = html
    .replaceAll("Smrť a sex v kempe Miazma", "Teenage Sex and Death at Camp Miasma")
    .replace("teaser-20053", "teaser-20192");
  const result = parseA4KinoInak(html, {
    englishTitles: parseA4EnglishTitles(englishHtml),
  });
  assert.equal(result.movies[0].title, "Smrť a sex v kempe Miazma");
  assert.equal(result.movies[0].englishTitle, "Teenage Sex and Death at Camp Miasma");
  assert.equal(result.screenings[0].cinemaId, "a4-kino-inak");
  assert.equal(result.screenings[0].startsAt, "2026-09-14T20:00:00+02:00");
  assert.equal(result.screenings[0].price, "predpredaj 6 € / zľavnené 4 € / na mieste 6,5 €");
  assert.match(result.screenings[0].bookingUrl, /szaawly/);
});

test("parses A4 Kino inak detail metadata", async () => {
  const details = parseA4KinoInakDetails(await fixture("a4-kino-inak-detail.html"));
  assert.equal(details.releaseYear, "2026");
  assert.equal(details.durationMinutes, 116);
  assert.equal(details.ageRating, "18");
  assert.deepEqual(details.directors, ["Jane Schoenbrun"]);
  assert.deepEqual(details.languages.original, ["en"]);
  assert.deepEqual(details.languages.subtitles, ["cs"]);
  assert.equal(details.posterUrl, "https://a4.sk/wp-content/uploads/film.png");
});

test("new cinema parsers reject pages without schedules", () => {
  assert.throws(() => parseMladost("<html></html>"), /no recognizable screenings/i);
  assert.throws(() => parseFilmEurope("<html></html>"), /no recognizable screenings/i);
  assert.throws(() => parseLuky("<html></html>"), /no recognizable screenings/i);
  assert.throws(() => parseNostalgia("<html></html>"), /no recognizable screenings/i);
  assert.throws(() => parseEdison("<html></html>"), /no recognizable screenings/i);
  assert.throws(() => parseNovaCvernovka("<html></html>"), /no recognizable programme items/i);
  assert.throws(() => parseA4KinoInak("<html></html>"), /no recognizable screenings/i);
});
