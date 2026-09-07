import assert from "node:assert/strict";
import test from "node:test";
import { formatDuration } from "../site/formatters.js";

test("formats film duration as hours and minutes", () => {
  assert.equal(formatDuration(45), "0\u00a0h\u00a045\u00a0min");
  assert.equal(formatDuration(120), "2\u00a0h\u00a00\u00a0min");
  assert.equal(formatDuration(317), "5\u00a0h\u00a017\u00a0min");
});
