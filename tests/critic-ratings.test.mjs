import assert from "node:assert/strict";
import test from "node:test";
import { metascoreTone, tomatoTone } from "../site/critic-ratings.js";

test("uses movie Metascore thresholds rather than game thresholds", () => {
  for (const [score, tone] of [[0, "negative"], [39, "negative"], [40, "mixed"], [60, "mixed"], [61, "positive"], [100, "positive"]]) {
    assert.equal(metascoreTone(score), tone);
  }
});

test("Tomatometer switches to Fresh at 60 percent", () => {
  assert.equal(tomatoTone(0), "rotten");
  assert.equal(tomatoTone(59), "rotten");
  assert.equal(tomatoTone(60), "fresh");
  assert.equal(tomatoTone(100), "fresh");
});
