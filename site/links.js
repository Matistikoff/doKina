export function actorSearchUrl(name) {
  return personSearchUrl(name);
}

export function directorSearchUrl(name) {
  return personSearchUrl(name);
}

export function movieDetailUrl(movieId, currentUrl) {
  const url = new URL(currentUrl);
  url.pathname = `/film/${encodeURIComponent(movieId)}`;
  url.hash = "";
  return url.href;
}

export function rottenTomatoesMovieUrl(movie) {
  if (/^m\/[0-9A-Za-z_][-0-9A-Za-z_'.]*$/u.test(movie.rottenTomatoesId || "")) {
    return `https://www.rottentomatoes.com/${movie.rottenTomatoesId}`;
  }
  const url = new URL("https://www.rottentomatoes.com/search/");
  url.searchParams.set("search", movieSearchTitle(movie));
  return url.href;
}

export function metacriticMovieUrl(movie) {
  if (/^movie\/[-a-z0-9!+_()]+$/u.test(movie.metacriticId || "")) {
    return `https://www.metacritic.com/${movie.metacriticId}/`;
  }
  return `https://www.metacritic.com/search/${encodeURIComponent(movieSearchTitle(movie))}/`;
}

function movieSearchTitle(movie) {
  return [movie.englishTitle || movie.originalTitle || movie.title, movie.releaseYear].filter(Boolean).join(" ");
}

function personSearchUrl(name) {
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", name);
  return url.href;
}
