import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fetchNostalgia, parseEntradioEventList } from "../scraper/sources/kino-nostalgia.mjs";
import { fetchFilmEurope } from "../scraper/sources/kino-film-europe.mjs";
import { fetchEntradioEvents } from "../scraper/sources/entradio.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/entradio-events.json", import.meta.url)));
const events = fixture.data.paginatedEventsOnEcommerce.items;
const source = { cinemaId: "nostalgia", sourceId: "kino-nostalgia", programUrl: "https://www.nostalgia.sk/", cinemaName: "Kino Nostalgia" };

test("parses public Entradio events with stable IDs, timestamps and metadata", () => {
  const result = parseEntradioEventList([...events, events[0]], source);
  assert.equal(result.screenings.length, 2);
  assert.equal(result.screenings[0].id, "kino-nostalgia-89460");
  assert.equal(result.screenings[0].startsAt, "2026-09-09T15:00:00.000Z");
  assert.equal(result.screenings[0].bookingUrl, "https://shop.entradio.sk/event/89460");
  assert.deepEqual(result.screenings[0].format, ["2D"]);
  assert.deepEqual(result.screenings[1].languages.subtitles, ["cs"]);
  assert.equal(result.movies[0].ageRating, "15");
  assert.equal(result.movies[0].posterUrl, "https://images.example/poster-large.jpg");
  assert.equal(result.movies[0].detailUrl, "https://www.nostalgia.sk/film/10899");
});

test("maps dubbing, bilingual subtitles, original language and sold-out events", () => {
  for (const [versionCode, kind, expected] of [["dubbing_slk", "dubbed", ["sk"]], ["subtitles_ces_eng", "subtitles", ["cs", "en"]], ["ukr", "original", ["uk"]]]) {
    const result = parseEntradioEventList([{ ...events[0], versionCode, availableSeatsCount: 0 }], source);
    assert.deepEqual(result.screenings[0].languages[kind], expected);
    assert.equal(result.screenings[0].soldOut, true);
  }
});

function mockRequest(responses, calls = []) {
  return async (url, options) => {
    calls.push({ url, ...options, body: JSON.parse(options.body) });
    assert.ok(responses.length, "Unexpected extra request");
    return new Response(JSON.stringify(responses.shift()));
  };
}
const login = { data: { loginLead: { eSid: "test-guest-session" } } };

test("fetches all pages with the public guest session and cinema filters", async () => {
  const calls = [];
  const request = mockRequest([login, { data: { paginatedEventsOnEcommerce: { items: [events[0]], pagination: { hasMore: true, offset: 1, limit: 100 } } } }, fixture], calls);
  const result = await fetchEntradioEvents({ clientId: 133, venueId: 747, from: "2026-09-08T00:00:00.000Z", request });
  assert.equal(result.length, 3);
  assert.equal(calls[1].headers["e-sid"], "test-guest-session");
  assert.deepEqual(calls[1].body.variables.filter, { venueId: 747, state: "published", showOnWebsiteAndApi: true, from: "2026-09-08T00:00:00.000Z" });
  assert.equal(calls[2].body.variables.paginationInput.offset, 1);
});

test("both adapters use the correct tenant and venue without fetching blocked HTML", async () => {
  for (const [fetcher, clientId, venueId, cinemaId] of [[fetchNostalgia, 133, 747, "nostalgia"], [fetchFilmEurope, 32, 240, "film-europe"]]) {
    const calls = [];
    const result = await fetcher({ request: mockRequest([login, fixture], calls) });
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.url === "https://shop.entradio.sk/api/graphql"));
    assert.equal(calls[1].body.variables.clientId, clientId);
    assert.equal(calls[1].body.variables.filter.venueId, venueId);
    assert.equal(result.screenings[0].cinemaId, cinemaId);
  }
});

test("rejects API errors, invalid sessions and incomplete pagination", async () => {
  for (const [responses, expected] of [
    [[{ errors: [{ message: "NOT_AUTHENTICATED" }], data: null }], /NOT_AUTHENTICATED/],
    [[{ data: { loginLead: {} } }], /guest session/],
    [[login, { errors: [{ message: "SOURCE_UNAVAILABLE" }], data: fixture.data }], /SOURCE_UNAVAILABLE/],
    [[login, { data: {} }], /Invalid Entradio/],
    [[login, { data: { paginatedEventsOnEcommerce: { items: events, pagination: { hasMore: true, offset: 0 } } } }], /pagination/],
  ]) {
    await assert.rejects(fetchEntradioEvents({ clientId: 133, venueId: 747, request: mockRequest(responses) }), expected);
  }
  assert.throws(() => parseEntradioEventList([], source), /no recognizable screenings/);
});
