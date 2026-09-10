import assert from "node:assert/strict";
import test from "node:test";
import { countryFlag, countryFlagPath, countryName, formatDuration, formatUsd } from "../site/formatters.js";

test("formats film duration as hours and minutes", () => {
  assert.equal(formatDuration(45), "0\u00a0h\u00a045\u00a0min");
  assert.equal(formatDuration(120), "2\u00a0h\u00a00\u00a0min");
  assert.equal(formatDuration(317), "5\u00a0h\u00a017\u00a0min");
});

test("formats box office with a dollar sign and grouped digits", () => {
  assert.equal(formatUsd(123456789), "$123\u00a0456\u00a0789");
});

test("formats production country codes as accessible flags", () => {
  assert.equal(countryFlag("SK"), "🇸🇰");
  assert.equal(countryFlag("cz"), "🇨🇿");
  assert.equal(countryFlag("Slovakia"), "");
  assert.equal(countryFlagPath("SK"), "/flags/sk.svg");
  assert.equal(countryFlagPath("Slovakia"), "");
  assert.ok(countryName("SK"));
  assert.equal(countryName("XC"), "Československo");
  assert.equal(countryName("invalid"), "");
});
