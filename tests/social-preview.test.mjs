import assert from "node:assert/strict";
import test from "node:test";
import worker, { defaultSocialPreview, injectSocialPreview, movieIdFromPath, socialPreviewForMovie } from "../worker.mjs";

test("reads a movie ID from a shareable path", () => {
  assert.equal(movieIdFromPath("/film/movie-hamnet-2025"), "movie-hamnet-2025");
  assert.equal(movieIdFromPath("/film/film%20id/"), "film id");
  assert.equal(movieIdFromPath("/"), null);
  assert.equal(movieIdFromPath("/film/%E0%A4%A"), null);
});

test("uses a trusted TMDB backdrop in movie social metadata", () => {
  const metadata = socialPreviewForMovie({ movies: [{
    id: "film-1",
    title: 'Film & "priateľ"',
    backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
  }] }, "film-1", "https://dokina.sk");
  assert.equal(metadata.imageUrl, "https://image.tmdb.org/t/p/w1280/backdrop.jpg");
  assert.equal(metadata.canonicalUrl, "https://dokina.sk/film/film-1");
  assert.equal(metadata.type, "video.movie");

  const html = injectSocialPreview("<head><!-- social-preview:start -->old<!-- social-preview:end --><title>Old</title></head>", metadata);
  assert.match(html, /property="og:image" content="https:\/\/image\.tmdb\.org\/t\/p\/w1280\/backdrop\.jpg"/u);
  assert.match(html, /Film &amp; &quot;priateľ&quot; — doKina\.sk/u);
  assert.match(html, /<link rel="canonical" href="https:\/\/dokina\.sk\/film\/film-1" \/>/u);
  assert.match(html, /<title>Film &amp; &quot;priateľ&quot; — doKina\.sk<\/title>/u);
  assert.doesNotMatch(html, /application\/ld\+json/u);
  assert.doesNotMatch(html, /twitter:/u);
});

test("creates movie metadata for a separately stored upcoming film", () => {
  const metadata = socialPreviewForMovie({ movies: [], upcomingMovies: [{
    id: "upcoming-tmdb-20", title: "Premiéra", releaseDate: "2026-10-02",
  }] }, "upcoming-tmdb-20", "https://dokina.sk");
  assert.match(metadata.description, /očakávame/u);
  assert.equal(metadata.canonicalUrl, "https://dokina.sk/film/upcoming-tmdb-20");
});

test("falls back to the site preview for missing or untrusted backdrops", () => {
  for (const backdropUrl of [null, "https://example.com/image.jpg"]) {
    const metadata = socialPreviewForMovie({ movies: [{ id: "film-1", title: "Film", backdropUrl }] },
      "film-1", "https://dokina.sk");
    assert.equal(metadata.imageUrl, "https://dokina.sk/og.png");
  }
  assert.equal(socialPreviewForMovie({ movies: [] }, "missing", "https://dokina.sk"), null);
});

test("builds the default preview URL from the active site origin", () => {
  const metadata = defaultSocialPreview("https://dokina-sk.example.workers.dev");
  assert.equal(metadata.canonicalUrl, "https://dokina-sk.example.workers.dev/");
  assert.equal(metadata.imageUrl, "https://dokina-sk.example.workers.dev/og.png");
});

test("serves an SPA page with movie-specific metadata", async () => {
  const index = "<html><head><!-- social-preview:start -->old<!-- social-preview:end --><title>Old</title></head></html>";
  const program = { movies: [{
    id: "film-1",
    title: "Film",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
  }] };
  const env = { ASSETS: { fetch: async (request) => {
    const pathname = new URL(request.url || request).pathname;
    if (pathname === "/index.html") return new Response(index, { headers: { "content-type": "text/html" } });
    if (pathname === "/program.json") return Response.json(program);
    return new Response("fallback", { status: 404 });
  } } };

  const response = await worker.fetch(new Request("https://dokina.sk/film/film-1"), env);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<title>Film — doKina\.sk<\/title>/u);
  assert.equal(response.headers.get("cache-control"), "public, max-age=300");
});

test("serves the homepage with an absolute default image URL", async () => {
  const index = "<html><head><!-- social-preview:start -->old<!-- social-preview:end --><title>Old</title></head></html>";
  const env = { ASSETS: { fetch: async (request) => {
    const pathname = new URL(request.url || request).pathname;
    return pathname === "/index.html"
      ? new Response(index, { headers: { "content-type": "text/html" } })
      : new Response("missing", { status: 404 });
  } } };

  const response = await worker.fetch(new Request("https://kino.example/"), env);
  const html = await response.text();
  assert.match(html, /property="og:image" content="https:\/\/kino\.example\/og\.png"/u);
  assert.match(html, /property="og:url" content="https:\/\/kino\.example\/"/u);
  assert.match(html, /<link rel="canonical" href="https:\/\/kino\.example\/" \/>/u);
  assert.match(html, /"@type": "WebSite"/u);
});
