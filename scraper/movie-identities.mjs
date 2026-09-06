// Explicitly confirmed identities for source records that omit film metadata.
// Scope by cinema and external ID, never by an ambiguous translated title alone.
const IDENTITIES = new Map([
  ["kino-nostalgia:11420", { title: "Nenávisť", originalTitle: "La Haine", releaseYear: "1995" }],
]);

export function applyKnownMovieIdentity(movie) {
  const identity = IDENTITIES.get(`${movie.source}:${movie.externalId}`);
  if (!identity || movie.title !== identity.title) return movie;
  if (movie.originalTitle && movie.originalTitle !== identity.originalTitle) return movie;
  if (movie.releaseYear && String(movie.releaseYear) !== identity.releaseYear) return movie;
  return { ...movie, originalTitle: identity.originalTitle, releaseYear: identity.releaseYear };
}
