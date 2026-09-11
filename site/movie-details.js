export function createMovieDetailLoader(fetcher = fetch) {
  const cache = new Map();
  return async (movie) => {
    if (!movie.detailDataUrl) return movie;
    if (!cache.has(movie.detailDataUrl)) {
      const request = (async () => {
        const response = await fetcher(movie.detailDataUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const detail = await response.json();
        if (detail.id !== movie.id) throw new Error("Movie detail ID mismatch");
        return detail;
      })();
      cache.set(movie.detailDataUrl, request);
      request.catch(() => cache.delete(movie.detailDataUrl));
    }
    return { ...movie, ...await cache.get(movie.detailDataUrl) };
  };
}
