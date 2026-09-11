import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SITE_ORIGIN = "https://do-kina.sk";

test("publishes crawl and sitemap directives for the canonical domain", async () => {
  const [robots, sitemap] = await Promise.all([
    readFile(new URL("../site/robots.txt", import.meta.url), "utf8"),
    readFile(new URL("../site/sitemap.xml", import.meta.url), "utf8"),
  ]);

  assert.match(robots, /^User-agent: \*$/mu);
  assert.match(robots, /^Allow: \/$/mu);
  assert.match(robots, new RegExp(`^Sitemap: ${SITE_ORIGIN.replaceAll(".", "\\.")}\/sitemap\\.xml$`, "mu"));
  assert.match(sitemap, new RegExp(`<loc>${SITE_ORIGIN.replaceAll(".", "\\.")}\/<\\/loc>`, "u"));
});

test("identifies doKina.sk to search engines on the homepage", async () => {
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");

  assert.match(html, /<link rel="canonical" href="https:\/\/do-kina\.sk\/" \/>/u);
  assert.match(html, /<title>doKina\.sk – Program kín a filmy v Bratislave<\/title>/u);
  assert.match(html, /<h1 id="program-heading">Filmy, ktoré práve hrajú v Bratislave<\/h1>/u);
  assert.match(html, /<p class="program-description">Aktuálny program bratislavských kín na jednom mieste\.<\/p>/u);

  const match = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/u);
  assert.ok(match, "WebSite structured data is present");
  assert.deepEqual(JSON.parse(match[1]), {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "doKina.sk",
    alternateName: ["doKina", "do-kina.sk", "dokina"],
    url: `${SITE_ORIGIN}/`,
  });
});
