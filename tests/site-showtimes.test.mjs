import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("showtime links use the booking URL of their own screening", async () => {
  const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
  const showtimeElement = source.match(/function showtimeElement\([\s\S]*?\n}\n/)?.[0];

  assert.ok(showtimeElement, "showtimeElement should exist");
  assert.match(showtimeElement, /screening\.bookingUrl && !screening\.soldOut/);
  assert.match(showtimeElement, /element\.href = screening\.bookingUrl/);
  assert.doesNotMatch(showtimeElement, /movie\.detailUrl/);
});
