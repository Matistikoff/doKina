import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  enrichMoviesWithTmdb,
  fetchUpcomingMovies,
  lookupTitles,
  preserveTmdbMetadata,
  resolveTmdbMovie,
  selectBackdrop,
  selectPoster,
  selectTrailer,
} from "../scraper/tmdb.mjs";
import { applyKnownMovieIdentity } from "../scraper/movie-identities.mjs";

const haine = {
  id: 406,
  title: "Nenávisť",
  original_title: "La Haine",
  original_language: "fr",
  release_date: "1995-05-31",
  imdb_id: "tt0113247",
  runtime: 98,
  budget: 2500000,
  revenue: 123456789,
  vote_average: 8.1,
  vote_count: 4100,
  credits: { crew: [{ job: "Director", name: "Mathieu Kassovitz" }] },
  production_countries: [{ iso_3166_1: "FR", name: "France" }],
  spoken_languages: [
    { iso_639_1: "fr", english_name: "French", name: "Français" },
    { iso_639_1: "ar", english_name: "Arabic", name: "العربية" },
  ],
  images: {
    posters: [{ file_path: "/haine-sk.jpg", iso_639_1: "sk", vote_count: 2 }],
    backdrops: [{ file_path: "/haine-backdrop.jpg", iso_639_1: null, vote_count: 5 }],
  },
  videos: { results: [
    { site: "YouTube", key: "abcdefghijk", type: "Trailer", official: true, iso_639_1: "fr", size: 1080 },
  ] },
};

test("retries an empty year-filtered search and recognizes translated titles", async () => {
  const calls = [];
  const result = await resolveTmdbMovie({ title: "Nenávisť", releaseYear: "1996" }, "test", async (path, params) => {
    calls.push(params);
    if (path === "search/movie") return { results: params.year ? [] : [{ ...haine, title: "La Haine" }], total_pages: 1 };
    return { ...haine, title: "La Haine", translations: { translations: [
      { iso_639_1: "sk", data: { title: "Nenávisť" } },
      { iso_639_1: "en", data: { title: "Hate" } },
    ] } };
  });
  assert.equal(result.imdbId, "tt0113247");
  assert.equal(result.originalLanguage, "fr");
  assert.equal(result.englishTitle, "Hate");
  assert.equal(calls[0].year, "1996");
  assert.equal(calls[1].year, undefined);
});

function tmdbMock(films = [haine]) {
  return async (path) => path === "search/movie"
    ? { results: films, total_pages: 1 }
    : films.find((film) => path === `movie/${film.id}`);
}

async function cachePath() {
  return join(await mkdtemp(join(tmpdir(), "dokina-tmdb-")), "tmdb.json");
}

test("confirmed film metadata is scoped to its source record and preserves IDs", () => {
  const movie = { id: "movie-nenavist", source: "kino-nostalgia", externalId: "11420", title: "Nenávisť" };
  assert.deepEqual(applyKnownMovieIdentity(movie), { ...movie, originalTitle: "La Haine", releaseYear: "1995" });
  for (const change of [{ externalId: "999" }, { source: "other" }, { releaseYear: "2004" }, { originalTitle: "The Grudge" }]) {
    const other = { ...movie, ...change };
    assert.deepEqual(applyKnownMovieIdentity(other), other);
  }
});

test("resolves a unique localized title with IDs and poster", async () => {
  const result = await resolveTmdbMovie({ title: "Nenávisť" }, "test", tmdbMock());
  assert.equal(result.tmdbId, 406);
  assert.equal(result.imdbId, "tt0113247");
  assert.equal(result.posterUrl, "https://image.tmdb.org/t/p/w500/haine-sk.jpg");
  assert.equal(result.backdropUrl, "https://image.tmdb.org/t/p/w1280/haine-backdrop.jpg");
  assert.equal(result.trailerUrl, "https://www.youtube.com/watch?v=abcdefghijk");
  assert.equal(result.budgetUsd, 2500000);
  assert.equal(result.worldwideGrossUsd, 123456789);
  assert.deepEqual(result.productionCountries, ["FR"]);
  assert.deepEqual(result.spokenLanguages, ["fr", "ar"]);

  const alternate = { ...haine, title: "La Haine", alternative_titles: { titles: [{ title: "Nenávisť" }] } };
  assert.equal((await resolveTmdbMovie({ title: "Nenávisť" }, "test", tmdbMock([alternate]))).tmdbId, 406);
});

test("omits missing TMDB budget and worldwide revenue", async () => {
  const withoutFinancials = { ...haine, budget: 0, revenue: 0 };
  const result = await resolveTmdbMovie({ title: "Nenávisť" }, "test", tmdbMock([withoutFinancials]));
  assert.equal(result.budgetUsd, undefined);
  assert.equal(result.worldwideGrossUsd, undefined);
});

test("selects a clean backdrop and an official trailer", () => {
  const backdrops = [
    { file_path: "/sk.jpg", iso_639_1: "sk", vote_count: 20 },
    { file_path: "/neutral.jpg", iso_639_1: null, vote_count: 1 },
  ];
  assert.equal(selectBackdrop({ images: { backdrops } }), "https://image.tmdb.org/t/p/w1280/neutral.jpg");
  assert.equal(selectBackdrop({ images: { backdrops: [] }, backdrop_path: "/fallback.jpg" }),
    "https://image.tmdb.org/t/p/w1280/fallback.jpg");

  const videos = { results: [
    { site: "Vimeo", key: "ignored1", type: "Trailer", official: true, iso_639_1: "sk" },
    { site: "YouTube", key: "teaser12345", type: "Teaser", official: true, iso_639_1: "sk" },
    { site: "YouTube", key: "trailer1234", type: "Trailer", official: false, iso_639_1: "sk" },
    { site: "YouTube", key: "official123", type: "Trailer", official: true, iso_639_1: "en" },
  ] };
  assert.equal(selectTrailer({ videos }), "https://www.youtube.com/watch?v=official123");
});

test("falls back to an English trailer when localized videos are unavailable", async () => {
  const withoutVideos = { ...haine, videos: { results: [] } };
  const calls = [];
  const result = await resolveTmdbMovie({ title: "Nenávisť" }, "test", async (path, parameters) => {
    calls.push({ path, parameters });
    if (path === "search/movie") return { results: [withoutVideos], total_pages: 1 };
    if (path === "movie/406/videos") return { results: [
      { site: "YouTube", key: "english12345", type: "Trailer", official: true, iso_639_1: "en" },
    ] };
    return withoutVideos;
  });
  assert.equal(result.trailerUrl, "https://www.youtube.com/watch?v=english12345");
  assert.deepEqual(calls.find((call) => call.path === "movie/406/videos")?.parameters, { language: "en-US" });
});

test("keeps film metadata when the English trailer fallback fails", async () => {
  const withoutVideos = { ...haine, videos: { results: [] } };
  const result = await resolveTmdbMovie({ title: "Nenávisť" }, "test", async (path) => {
    if (path === "search/movie") return { results: [withoutVideos], total_pages: 1 };
    if (path === "movie/406/videos") throw new Error("Service unavailable");
    return withoutVideos;
  });
  assert.equal(result.tmdbId, 406);
  assert.equal(result.budgetUsd, 2500000);
  assert.equal(result.worldwideGrossUsd, 123456789);
  assert.equal(result.trailerUrl, null);
});

test("prefers a clean language-neutral poster before localized posters", () => {
  const posters = [
    { file_path: "/en.jpg", iso_639_1: "en", vote_count: 100 },
    { file_path: "/neutral.jpg", iso_639_1: null, vote_count: 100 },
    { file_path: "/cs.jpg", iso_639_1: "cs", vote_count: 1 },
    { file_path: "/sk-low.jpg", iso_639_1: "sk", vote_count: 1, vote_average: 5 },
    { file_path: "/sk-best.jpg", iso_639_1: "sk", vote_count: 2, vote_average: 4 },
  ];
  assert.equal(selectPoster({ images: { posters } }), "https://image.tmdb.org/t/p/w500/neutral.jpg");
  const localized = posters.filter((poster) => poster.iso_639_1 !== null);
  assert.equal(selectPoster({ images: { posters: localized } }), "https://image.tmdb.org/t/p/w500/sk-best.jpg");
  assert.equal(selectPoster({ images: { posters: localized.filter((poster) => poster.iso_639_1 !== "sk") } }),
    "https://image.tmdb.org/t/p/w500/cs.jpg");
  assert.equal(selectPoster({ images: { posters: localized.filter((poster) => !["sk", "cs"].includes(poster.iso_639_1)) } }),
    "https://image.tmdb.org/t/p/w500/en.jpg");
  assert.equal(selectPoster({ images: { posters: [] }, poster_path: "/fallback.jpg" }),
    "https://image.tmdb.org/t/p/w500/fallback.jpg");
});

test("rejects wrong years, directors, durations, IMDb IDs and fuzzy titles", async () => {
  for (const movie of [
    { title: "Nenávisť", releaseYear: 2026 },
    { title: "Nenávisť", directors: ["Other Director"] },
    { title: "Nenávisť", durationMinutes: 130 },
    { title: "Nenávisť", imdbId: "tt9999999" },
    { title: "Nenávisť 2" },
  ]) assert.equal(await resolveTmdbMovie(movie, "test", tmdbMock()), null);
});

test("does not select a popular result when a remake is ambiguous or search is truncated", async () => {
  const remake = { ...haine, id: 407, release_date: "2020-01-01", imdb_id: null };
  assert.equal(await resolveTmdbMovie({ title: "Nenávisť" }, "test", tmdbMock([haine, remake])), null);
  assert.equal((await resolveTmdbMovie({ title: "Nenávisť", releaseYear: 1995 }, "test", tmdbMock([haine, remake]))).tmdbId, 406);
  assert.equal(await resolveTmdbMovie({ title: "Nenávisť" }, "test",
    async () => ({ results: [haine], total_pages: 2 })), null);
});

test("cleans event labels without splitting double features or sequel numbers", () => {
  assert.deepEqual(lookupTitles({ title: "20. VÝROČIE FILMU WHOLETRAIN + beseda s režisérom" }), ["WHOLETRAIN"]);
  assert.deepEqual(lookupTitles({ title: "Domáca úroda: KAVEJ 2 | Filmový večer" }), ["KAVEJ 2"]);
  assert.deepEqual(lookupTitles({ title: "Pozdravy z Rodosu + Zakorenení vo vode" }), ["Pozdravy z Rodosu + Zakorenení vo vode"]);
});

test("enriches, caches and reuses a fresh TMDB result", async () => {
  const path = await cachePath();
  const movies = [{ id: "nenavist", title: "Nenávisť" }];
  const now = new Date("2026-09-08T10:00:00Z");
  const [result] = await enrichMoviesWithTmdb(movies, { apiKey: "test", cachePath: path, now, request: tmdbMock() });
  assert.equal(result.tmdbId, 406);
  assert.equal(JSON.parse(await readFile(path, "utf8")).entries.nenavist.tmdbId, 406);
  const [cached] = await enrichMoviesWithTmdb(movies, {
    apiKey: "test", cachePath: path, now: new Date("2026-09-08T12:00:00Z"),
    request: async () => assert.fail("fresh cache should avoid requests"),
  });
  assert.equal(cached.posterUrl, result.posterUrl);
  assert.equal(cached.budgetUsd, result.budgetUsd);
  assert.equal(cached.worldwideGrossUsd, result.worldwideGrossUsd);
});

test("prefers the TMDB poster and keeps it during an outage", async () => {
  const path = await cachePath();
  const movie = { id: "nenavist", title: "Nenávisť", posterUrl: "https://cinema.example/poster.jpg" };
  const [initial] = await enrichMoviesWithTmdb([movie], {
    apiKey: "test", cachePath: path, now: new Date("2026-09-01T10:00:00Z"), request: tmdbMock(),
  });
  assert.equal(initial.posterUrl, "https://image.tmdb.org/t/p/w500/haine-sk.jpg");
  const [stale] = await enrichMoviesWithTmdb([movie], {
    apiKey: "test", cachePath: path, now: new Date("2026-09-03T10:00:00Z"),
    request: async () => { throw new Error("Service unavailable"); },
  });
  assert.equal(stale.tmdbId, 406);
  assert.equal(stale.posterUrl, "https://image.tmdb.org/t/p/w500/haine-sk.jpg");
});

test("preserves unambiguous previous TMDB metadata without an API key", async () => {
  const movie = { id: "new-id", title: "Nenávisť", releaseYear: "1995" };
  const previous = { ...movie, id: "old-id", tmdbId: 406,
    posterUrl: "https://image.tmdb.org/t/p/w500/haine-sk.jpg" };
  assert.equal(preserveTmdbMetadata([movie], [previous])[0].tmdbId, 406);
  const [result] = await enrichMoviesWithTmdb([movie], {
    cachePath: await cachePath(), previousMovies: [previous],
    request: async () => assert.fail("no request without an API key"),
  });
  assert.equal(result.tmdbId, 406);
});

test("combines popular Slovak and worldwide upcoming releases separately from current films", async () => {
  const calls = [];
  const movies = await fetchUpcomingMovies({
    apiKey: "test",
    now: new Date("2026-09-11T08:00:00Z"),
    currentMovies: [{ id: "playing", title: "Už hrá", tmdbId: 10 }],
    request: async (path, parameters) => {
      calls.push({ path, parameters });
      if (path === "genre/movie/list") return { genres: [{ id: 18, name: "Dráma" }] };
      if (parameters.region === "SK") return { results: [
        { id: 10, title: "Už hrá", release_date: "2026-09-20", poster_path: "/playing.jpg" },
        { id: 20, title: "Veľká premiéra", original_title: "Big Premiere", original_language: "en",
          release_date: "2026-10-02", poster_path: "/poster.jpg", backdrop_path: "/backdrop.jpg",
          overview: "Pripravovaný film.", genre_ids: [18] },
        { id: 30, title: "Bez plagátu", release_date: "2026-10-10", poster_path: null },
      ] };
      return { results: [
        { id: 20, title: "Veľká premiéra", release_date: "2026-10-02", poster_path: "/poster.jpg" },
        { id: 40, title: "Svetový hit", original_language: "en", release_date: "2026-09-25",
          poster_path: "/world.jpg", popularity: 100, genre_ids: [18] },
      ] };
    },
  });
  assert.equal(movies.length, 2);
  assert.deepEqual(movies.find((movie) => movie.tmdbId === 20), {
    id: "upcoming-tmdb-20",
    title: "Veľká premiéra",
    tmdbId: 20,
    releaseDate: "2026-10-02",
    releaseRegion: "SK",
    releaseYear: "2026",
    posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
    originalTitle: "Big Premiere",
    originalLanguage: "en",
    overview: "Pripravovaný film.",
    overviewLanguage: "sk",
    genres: ["Dráma"],
  });
  assert.equal(movies.find((movie) => movie.tmdbId === 40).releaseRegion, "worldwide");
  const discoveries = calls.filter((call) => call.path === "discover/movie");
  assert.equal(discoveries.length, 2);
  assert.equal(discoveries[0].parameters.region, "SK");
  assert.equal(discoveries[0].parameters.sort_by, "popularity.desc");
  assert.equal(discoveries[0].parameters.with_release_type, "2|3");
  assert.equal(discoveries[1].parameters.region, undefined);
  assert.equal(discoveries[1].parameters["primary_release_date.gte"], "2026-09-11");
});

test("keeps future upcoming movies when TMDB is unavailable", async () => {
  const previousMovies = [
    { id: "old", title: "Minulosť", tmdbId: 1, releaseDate: "2026-09-01" },
    { id: "future", title: "Budúcnosť", tmdbId: 2, releaseDate: "2026-10-01" },
  ];
  const movies = await fetchUpcomingMovies({
    apiKey: "test",
    now: new Date("2026-09-11T08:00:00Z"),
    previousMovies,
    request: async () => { throw new Error("Service unavailable"); },
  });
  assert.deepEqual(movies, [{ ...previousMovies[1], releaseRegion: "SK" }]);
});
