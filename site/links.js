export function actorSearchUrl(name) {
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", name);
  return url.href;
}
