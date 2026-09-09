import assert from "node:assert/strict";
import test from "node:test";
import worker, { injectSocialPreview, movieIdFromPath, socialPreviewForMovie } from "../worker.mjs";

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
  assert.match(html, /<title>Film &amp; &quot;priateľ&quot; — doKina\.sk<\/title>/u);
  assert.doesNotMatch(html, /twitter:/u);
});

test("falls back to the site preview for missing or untrusted backdrops", () => {
  for (const backdropUrl of [null, "https://example.com/image.jpg"]) {
    const metadata = socialPreviewForMovie({ movies: [{ id: "film-1", title: "Film", backdropUrl }] },
      "film-1", "https://dokina.sk");
    assert.equal(metadata.imageUrl, "https://dokina.sk/og.png");
  }
  assert.equal(socialPreviewForMovie({ movies: [] }, "missing", "https://dokina.sk"), null);
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
