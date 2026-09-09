export function actorSearchUrl(name) {
  return personSearchUrl(name);
}

export function directorSearchUrl(name) {
  return personSearchUrl(name);
}

function personSearchUrl(name) {
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", name);
  return url.href;
}
