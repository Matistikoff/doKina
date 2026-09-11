const SOCIAL_PREVIEW_PATTERN = /<!-- social-preview:start -->[\s\S]*?<!-- social-preview:end -->/u;
const TRUSTED_BACKDROP_PATTERN = /^https:\/\/image\.tmdb\.org\/t\/p\/w1280\/[\w.-]+$/u;

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function movieIdFromPath(pathname) {
  const match = pathname.match(/^\/film\/([^/]+)\/?$/u);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function socialPreviewForMovie(program, movieId, origin) {
  const movie = [...(program?.movies || []), ...(program?.upcomingMovies || [])]
    .find((item) => item.id === movieId);
  if (!movie) return null;
  const upcoming = (program?.upcomingMovies || []).includes(movie);
  const canonicalUrl = `${origin}/film/${encodeURIComponent(movie.id)}`;
  const imageUrl = TRUSTED_BACKDROP_PATTERN.test(movie.backdropUrl || "")
    ? movie.backdropUrl
    : `${origin}/icon-512.png`;
  return {
    title: `${movie.title} — doKina.sk`,
    description: upcoming
      ? `${movie.title} očakávame v slovenských kinách. Pozri si pripravované filmy na doKina.sk.`
      : `${movie.title} práve hrá v Bratislave. Pozri si kiná a termíny premietaní na doKina.sk.`,
    type: "video.movie",
    canonicalUrl,
    imageUrl,
    imageType: imageUrl.endsWith(".png") ? "image/png" : "image/jpeg",
    imageWidth: imageUrl.endsWith(".png") ? 512 : 1280,
    imageHeight: imageUrl.endsWith(".png") ? 512 : 720,
    imageAlt: movie.backdropUrl === imageUrl ? `Scéna z filmu ${movie.title}` : `doKina.sk — ${movie.title}`,
  };
}

export function defaultSocialPreview(origin) {
  return {
    title: "doKina.sk — Vyber si najlepší film v kinách",
    description: "Všetky filmy, ktoré práve hrajú v Bratislave. Zoraď ich podľa hodnotenia a filtruj podľa žánru či kina.",
    type: "website",
    canonicalUrl: `${origin}/`,
    imageUrl: `${origin}/icon-512.png`,
    imageType: "image/png",
    imageWidth: 512,
    imageHeight: 512,
    imageAlt: "doKina.sk — filmy, ktoré práve hrajú v Bratislave",
  };
}

export function renderSocialPreview(metadata) {
  const fields = Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, escapeAttribute(value)]));
  const websiteStructuredData = metadata.type === "website"
    ? `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "doKina.sk",
      "alternateName": ["doKina", "do-kina.sk", "dokina"],
      "url": "${fields.canonicalUrl}"
    }
    </script>`
    : "";
  return `<!-- social-preview:start -->
    <link rel="canonical" href="${fields.canonicalUrl}" />
    <meta property="og:title" content="${fields.title}" />
    <meta property="og:description" content="${fields.description}" />
    <meta property="og:type" content="${fields.type}" />
    <meta property="og:site_name" content="doKina.sk" />
    <meta property="og:locale" content="sk_SK" />
    <meta property="og:url" content="${fields.canonicalUrl}" />
    <meta property="og:image" content="${fields.imageUrl}" />
    <meta property="og:image:secure_url" content="${fields.imageUrl}" />
    <meta property="og:image:type" content="${fields.imageType}" />
    <meta property="og:image:width" content="${fields.imageWidth}" />
    <meta property="og:image:height" content="${fields.imageHeight}" />
    <meta property="og:image:alt" content="${fields.imageAlt}" />${websiteStructuredData}
    <!-- social-preview:end -->`;
}

export function injectSocialPreview(html, metadata) {
  return html.replace(SOCIAL_PREVIEW_PATTERN, renderSocialPreview(metadata))
    .replace(/<title>[\s\S]*?<\/title>/u, `<title>${escapeAttribute(metadata.title)}</title>`);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const movieId = movieIdFromPath(url.pathname);
    const isHomepage = url.pathname === "/" || url.pathname === "/index.html";
    if ((!movieId && !isHomepage) || !["GET", "HEAD"].includes(request.method)) return env.ASSETS.fetch(request);

    const pageResponse = await env.ASSETS.fetch(new URL("/index.html", url));
    if (!pageResponse.ok) return env.ASSETS.fetch(request);

    let metadata = defaultSocialPreview(url.origin);
    if (movieId) {
      const programResponse = await env.ASSETS.fetch(new URL("/program.json", url));
      if (!programResponse.ok) return env.ASSETS.fetch(request);
      metadata = socialPreviewForMovie(await programResponse.json(), movieId, url.origin);
      if (!metadata) return env.ASSETS.fetch(request);
    }
    const html = await pageResponse.text();

    const headers = new Headers(pageResponse.headers);
    headers.delete("content-length");
    headers.delete("etag");
    headers.set("cache-control", "public, max-age=300");
    return new Response(request.method === "HEAD" ? null : injectSocialPreview(html, metadata), {
      status: pageResponse.status,
      headers,
    });
  },
};
