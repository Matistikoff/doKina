import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("showtime links use the cinema film detail instead of ticket checkout", async () => {
  const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
  const showtimeElement = source.match(/function showtimeElement\([\s\S]*?\n}\n/)?.[0];

  assert.ok(showtimeElement, "showtimeElement should exist");
  assert.match(showtimeElement, /screening\.detailUrl/);
  assert.match(showtimeElement, /movie\.source === screening\.source/);
  assert.match(showtimeElement, /cinema\?\.url/);
  assert.match(showtimeElement, /element\.href = detailUrl/);
  assert.doesNotMatch(showtimeElement, /element\.href = screening\.bookingUrl/);
});
