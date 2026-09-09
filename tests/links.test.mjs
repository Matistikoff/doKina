import assert from "node:assert/strict";
import test from "node:test";
import { actorSearchUrl, directorSearchUrl } from "../site/links.js";

test("builds an encoded Google search URL for an actor", () => {
  const url = new URL(actorSearchUrl("Zoë Saldaña & Co."));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/search");
  assert.equal(url.searchParams.get("q"), "Zoë Saldaña & Co.");
});

test("builds an encoded Google search URL for a director", () => {
  const url = new URL(directorSearchUrl("Kirk Jones"));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/search");
  assert.equal(url.searchParams.get("q"), "Kirk Jones");
});
