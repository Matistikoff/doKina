export const MAX_CAST_MEMBERS = 6;

function uniqueByName(items, nameOf) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const name = typeof nameOf(item) === "string" ? nameOf(item).trim() : "";
    const key = name.toLocaleLowerCase("sk");
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push({ item, name });
    if (result.length === MAX_CAST_MEMBERS) break;
  }
  return result;
}

export function limitedMovieCast(movie) {
  const cast = uniqueByName(Array.isArray(movie.cast) ? movie.cast : [], (person) => person?.name)
    .map(({ item, name }) => ({ ...item, name }));
  const actorSource = Array.isArray(movie.actors) ? movie.actors : cast.map((person) => person.name);
  const names = uniqueByName(actorSource, (name) => name).map(({ name }) => name);
  return { cast, names };
}
