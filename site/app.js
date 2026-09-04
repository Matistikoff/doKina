const state = {
  program: null,
  selectedDate: null,
  selectedCinemas: new Set(),
};

const elements = {
  allCinemasButton: document.querySelector("#all-cinemas-button"),
  cinemaFilter: document.querySelector("#cinema-filter"),
  dateFilter: document.querySelector("#date-filter"),
  freshness: document.querySelector("#freshness"),
  movieGrid: document.querySelector("#movie-grid"),
  resultCount: document.querySelector("#result-count"),
  selectedDateLabel: document.querySelector("#selected-date-label"),
  template: document.querySelector("#movie-card-template"),
  todayButton: document.querySelector("#today-button"),
};

const dateKey = (value) => value.slice(0, 10);
const timeValue = (value) => value.slice(11, 16);

function localToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDay(date, style = "short") {
  const parsed = new Date(`${date}T12:00:00`);
  if (style === "long") {
    return new Intl.DateTimeFormat("sk-SK", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(parsed);
  }
  return new Intl.DateTimeFormat("sk-SK", { weekday: "short" }).format(parsed).replace(".", "");
}

function formatDateNumber(date) {
  return new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "numeric" })
    .format(new Date(`${date}T12:00:00`));
}

function formatUpdated(value) {
  return new Intl.DateTimeFormat("sk-SK", {
    timeZone: "Europe/Bratislava",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function cinemaName(cinema) {
  return cinema.shortName || cinema.name.replace("Cinema City ", "");
}

function renderDates() {
  const dates = [...new Set(state.program.screenings.map((screening) => dateKey(screening.startsAt)))].sort();
  const today = localToday();

  if (!state.selectedDate || !dates.includes(state.selectedDate)) {
    state.selectedDate = dates.includes(today) ? today : dates[0];
  }

  elements.dateFilter.replaceChildren(...dates.slice(0, 14).map((date) => {
    const button = document.createElement("button");
    const label = date === today ? "Dnes" : formatDay(date);
    button.type = "button";
    button.className = `date-chip${date === state.selectedDate ? " is-active" : ""}`;
    button.dataset.date = date;
    button.setAttribute("aria-pressed", String(date === state.selectedDate));
    button.innerHTML = `<span class="day-name">${label}</span><span class="day-number">${formatDateNumber(date)}</span>`;
    button.addEventListener("click", () => {
      state.selectedDate = date;
      renderDates();
      renderProgram();
    });
    return button;
  }));
}

function renderCinemas() {
  if (state.selectedCinemas.size === 0) {
    state.program.cinemas.forEach((cinema) => state.selectedCinemas.add(cinema.id));
  }

  elements.cinemaFilter.replaceChildren(...state.program.cinemas.map((cinema) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cinema-chip";
    button.textContent = cinemaName(cinema);
    button.dataset.cinemaId = cinema.id;
    button.setAttribute("aria-pressed", String(state.selectedCinemas.has(cinema.id)));
    button.addEventListener("click", () => {
      if (state.selectedCinemas.has(cinema.id)) {
        state.selectedCinemas.delete(cinema.id);
      } else {
        state.selectedCinemas.add(cinema.id);
      }
      renderCinemas();
      renderProgram();
    });
    return button;
  }));

  const allSelected = state.selectedCinemas.size === state.program.cinemas.length;
  elements.allCinemasButton.textContent = allSelected ? "Zrušiť výber" : "Vybrať všetky";
}

function groupScreenings(screenings) {
  const groups = new Map();
  for (const screening of screenings) {
    const key = screening.movieId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(screening);
  }
  return groups;
}

function groupByCinema(screenings) {
  const groups = new Map();
  for (const screening of screenings) {
    if (!groups.has(screening.cinemaId)) groups.set(screening.cinemaId, []);
    groups.get(screening.cinemaId).push(screening);
  }
  return groups;
}

function showtimeElement(screening) {
  const element = document.createElement(screening.bookingUrl && !screening.soldOut ? "a" : "span");
  element.className = `showtime${screening.soldOut ? " is-sold-out" : ""}`;
  element.textContent = timeValue(screening.startsAt);
  element.title = screening.soldOut
    ? "Vypredané"
    : [screening.auditorium, screening.format?.join(" · ")].filter(Boolean).join(" · ") || "Kúpiť vstupenky";
  if (element instanceof HTMLAnchorElement) {
    element.href = screening.bookingUrl;
    element.target = "_blank";
    element.rel = "noreferrer";
    element.setAttribute("aria-label", `${timeValue(screening.startsAt)} — kúpiť vstupenky`);
  }
  return element;
}

function renderMovie(movie, screenings, cinemaMap) {
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector(".movie-card");
  const poster = fragment.querySelector(".poster");
  const ageBadge = fragment.querySelector(".age-badge");
  const imdbRating = fragment.querySelector(".imdb-rating");
  const groupsRoot = fragment.querySelector(".showtime-groups");

  fragment.querySelector("h3").textContent = movie.title;
  fragment.querySelector(".movie-kicker").textContent = movie.genres?.slice(0, 2).join(" · ") || "Film";
  fragment.querySelector(".movie-meta").textContent = [
    movie.durationMinutes ? `${movie.durationMinutes} min` : null,
    movie.releaseYear || null,
    movie.originalTitle && movie.originalTitle !== movie.title ? movie.originalTitle : null,
  ].filter(Boolean).join(" · ");

  if (movie.posterUrl) {
    poster.src = movie.posterUrl;
    poster.alt = `Plagát filmu ${movie.title}`;
    poster.addEventListener("error", () => poster.classList.add("is-broken"));
  }
  ageBadge.textContent = movie.ageRating || "";
  if (movie.imdbId && Number.isFinite(movie.imdbRating)) {
    imdbRating.href = `https://www.imdb.com/title/${movie.imdbId}/`;
    imdbRating.textContent = `IMDb ★ ${movie.imdbRating.toFixed(1)}`;
    imdbRating.title = movie.imdbVotes
      ? `IMDb hodnotenie z ${movie.imdbVotes.toLocaleString("sk-SK")} hlasov`
      : "IMDb hodnotenie";
    imdbRating.setAttribute("aria-label", `${movie.title}: IMDb hodnotenie ${movie.imdbRating.toFixed(1)} z 10`);
  }

  const byCinema = groupByCinema(screenings.sort((a, b) => a.startsAt.localeCompare(b.startsAt)));

  for (const [cinemaId, cinemaScreenings] of byCinema) {
    const group = document.createElement("div");
    group.className = "showtime-group";
    const label = document.createElement("span");
    label.className = "cinema-name";
    label.textContent = cinemaName(cinemaMap.get(cinemaId));
    const times = document.createElement("div");
    times.className = "showtimes";
    times.replaceChildren(...cinemaScreenings.map(showtimeElement));
    group.append(label, times);
    groupsRoot.append(group);
  }

  card.dataset.movieId = movie.id;
  return fragment;
}

function renderProgram() {
  const movieMap = new Map(state.program.movies.map((movie) => [movie.id, movie]));
  const cinemaMap = new Map(state.program.cinemas.map((cinema) => [cinema.id, cinema]));
  const visible = state.program.screenings.filter((screening) => (
    dateKey(screening.startsAt) === state.selectedDate
    && state.selectedCinemas.has(screening.cinemaId)
  ));
  const grouped = groupScreenings(visible);
  const today = localToday();

  elements.selectedDateLabel.textContent = state.selectedDate === today
    ? `Dnes · ${formatDay(state.selectedDate, "long")}`
    : formatDay(state.selectedDate, "long");
  elements.resultCount.textContent = `${grouped.size} ${grouped.size === 1 ? "film" : grouped.size < 5 ? "filmy" : "filmov"} · ${visible.length} predstavení`;

  if (visible.length === 0) {
    elements.movieGrid.innerHTML = `
      <div class="empty-state">
        <div><h3>Na tento výber nič nehrá</h3><p>Skús iný dátum alebo zapni ďalšie kino.</p></div>
      </div>`;
    return;
  }

  const cards = [...grouped.entries()]
    .map(([movieId, screenings]) => ({ movie: movieMap.get(movieId), screenings }))
    .filter(({ movie }) => movie)
    .sort((a, b) => {
      const firstA = a.screenings.map((item) => item.startsAt).sort()[0];
      const firstB = b.screenings.map((item) => item.startsAt).sort()[0];
      return firstA.localeCompare(firstB) || a.movie.title.localeCompare(b.movie.title, "sk");
    })
    .map(({ movie, screenings }) => renderMovie(movie, screenings, cinemaMap));

  elements.movieGrid.replaceChildren(...cards);
  elements.movieGrid.setAttribute("aria-busy", "false");
}

function renderFreshness() {
  const generated = new Date(state.program.generatedAt);
  const ageHours = (Date.now() - generated.getTime()) / 3_600_000;
  const dot = elements.freshness.querySelector(".status-dot");
  const label = elements.freshness.querySelector("span:last-child");
  const failedSources = state.program.sources?.filter((source) => source.status !== "ok") || [];

  if (failedSources.length) {
    dot.classList.add("is-error");
    label.textContent = `Aktualizované ${formatUpdated(state.program.generatedAt)} · niektoré zdroje zlyhali`;
  } else if (ageHours > 6) {
    dot.classList.add("is-stale");
    label.textContent = `Posledná aktualizácia ${formatUpdated(state.program.generatedAt)}`;
  } else {
    label.textContent = `Aktuálne · ${formatUpdated(state.program.generatedAt)}`;
  }
}

function registerProgramTool() {
  const context = document.modelContext;
  if (!context?.registerTool) return;

  const availableDates = new Set(state.program.screenings.map((screening) => dateKey(screening.startsAt)));
  const availableCinemas = new Set(state.program.cinemas.map((cinema) => cinema.id));

  try {
    void Promise.resolve(context.registerTool({
      name: "filter_program",
      title: "Filtrovať program kín",
      description: "Zmení viditeľný program na vybraný dátum a zoznam bratislavských kín.",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Dátum vo formáte YYYY-MM-DD." },
          cinemaIds: {
            type: "array",
            items: { type: "string", enum: [...availableCinemas] },
            description: "ID kín, ktoré majú zostať viditeľné."
          }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input = {}) {
        if (input.date !== undefined && !availableDates.has(input.date)) {
          throw new Error("Vybraný dátum nie je v aktuálnom programe.");
        }
        if (input.cinemaIds !== undefined && (!Array.isArray(input.cinemaIds) || input.cinemaIds.some((id) => !availableCinemas.has(id)))) {
          throw new Error("Zoznam obsahuje neznáme kino.");
        }
        if (input.date) state.selectedDate = input.date;
        if (input.cinemaIds) state.selectedCinemas = new Set(input.cinemaIds);
        renderDates();
        renderCinemas();
        renderProgram();
        const count = state.program.screenings.filter((screening) => dateKey(screening.startsAt) === state.selectedDate && state.selectedCinemas.has(screening.cinemaId)).length;
        return { date: state.selectedDate, cinemaIds: [...state.selectedCinemas], screeningCount: count };
      }
    })).catch((error) => console.warn("Program tool registration failed", error));
  } catch (error) {
    console.warn("Program tool registration failed", error);
  }
}

async function init() {
  try {
    const response = await fetch("/program.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.program = await response.json();
    renderFreshness();
    renderDates();
    renderCinemas();
    renderProgram();
    registerProgramTool();
  } catch (error) {
    console.error(error);
    elements.freshness.querySelector(".status-dot").classList.add("is-error");
    elements.freshness.querySelector("span:last-child").textContent = "Program sa nepodarilo načítať";
    elements.movieGrid.innerHTML = `
      <div class="error-state">
        <div><h3>Program si dal prestávku</h3><p>Skús stránku obnoviť o chvíľu.</p></div>
      </div>`;
  }
}

elements.todayButton.addEventListener("click", () => {
  const today = localToday();
  const dates = new Set(state.program.screenings.map((screening) => dateKey(screening.startsAt)));
  state.selectedDate = dates.has(today) ? today : [...dates].sort()[0];
  renderDates();
  renderProgram();
});

elements.allCinemasButton.addEventListener("click", () => {
  const allSelected = state.selectedCinemas.size === state.program.cinemas.length;
  state.selectedCinemas.clear();
  if (!allSelected) state.program.cinemas.forEach((cinema) => state.selectedCinemas.add(cinema.id));
  renderCinemas();
  renderProgram();
});

init();
