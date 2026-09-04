import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseEnglishTitles, parseLumiere, parseLumiereDetails } from "../scraper/sources/kino-lumiere.mjs";

const fixture = await readFile(new URL("./fixtures/kino-lumiere.html", import.meta.url), "utf8");

test("parses Kino Lumière HTML and removes programme labels from titles", () => {
  const result = parseLumiere(fixture, { referenceDate: "2026-09-04" });
  assert.equal(result.movies.length, 2);
  assert.equal(result.movies[0].title, "Bojovník");
  assert.equal(result.movies[0].originalTitle, "Bojovník");
  assert.deepEqual(result.movies[0].directors, ["Vojtěch Frič"]);
  assert.equal(result.screenings[0].startsAt, "2026-09-04T16:00:00+02:00");
  assert.equal(result.screenings[0].price, "3,- €");
  assert.equal(result.screenings[0].bookingUrl, "https://system.cinemaware.eu/wstep1.php?id=test");
});

test("parses poster, director, duration and genres from a Lumière film detail", () => {
  const details = parseLumiereDetails(`
    <div class="hlavnePlatnoPlatno">
      <div class="info"><div class="right"><table><tbody>
        <tr><td>Réžia:</td><td>Vojtěch Frič, Tomáš Dianiška</td></tr>
        <tr><td>Dĺžka:</td><td>110 minút</td></tr>
        <tr><td>Žáner:</td><td>Dráma, Komédia</td></tr>
      </tbody></table></div></div>
      <img src="/posters/bojovnik.jpg">
    </div>
  `, "https://www.kino-lumiere.sk/film/123");

  assert.equal(details.posterUrl, "https://www.kino-lumiere.sk/posters/bojovnik.jpg");
  assert.deepEqual(details.directors, ["Vojtěch Frič", "Tomáš Dianiška"]);
  assert.equal(details.durationMinutes, 110);
  assert.deepEqual(details.genres, ["Dráma", "Komédia"]);
});

test("infers the next year and recognizes sold-out screenings", () => {
  const result = parseLumiere(fixture, { referenceDate: "2026-09-04" });
  assert.equal(result.screenings[1].startsAt, "2027-01-01T20:30:00+01:00");
  assert.equal(result.screenings[1].soldOut, true);
  assert.equal(result.screenings[1].bookingUrl, null);
});

test("pairs the English programme title by Lumière film ID", () => {
  const englishFixture = fixture
    .replace("Bojovník | SENior kino", "The Fighter (2026) | Senior Cinema")
    .replace("Novoročný film | novinka", "New Year Film | New Release");
  const englishTitles = parseEnglishTitles(englishFixture);
  const result = parseLumiere(fixture, { referenceDate: "2026-09-04", englishTitles });

  assert.equal(result.movies[0].title, "Bojovník");
  assert.equal(result.movies[0].englishTitle, "The Fighter");
  assert.equal(result.movies[1].englishTitle, "New Year Film");
});

test("rejects HTML without schedule rows", () => {
  assert.throws(() => parseLumiere("<html></html>", { referenceDate: "2026-09-04" }), /no recognizable screenings/i);
});
