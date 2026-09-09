import { formatDuration } from "./formatters.js";
import { compareMoviesByDuration, isMustWatch, isOscarWinner } from "./discovery.js";
import { metascoreTone, tomatoTone } from "./critic-ratings.js";
import { isCzSkMovie } from "./filters.js";
import { compareMoviesByRating } from "./ratings.js";

const CULT_MOVIE_LATEST_YEAR = 2024;
const RECENTLY_ADDED_DAYS = 7;

const state = {
  program: null,
  selectedPeriod: "all",
  selectedDateStart: "",
  selectedDateEnd: "",
  selectedCinemas: new Set(),
  selectedGenres: new Set(),
  sortBy: "rating",
};

const elements = {
  cinemaDropdown: document.querySelector("#cinema-dropdown"),
  cinemaFilter: document.querySelector("#cinema-filter"),
  cinemaSummary: document.querySelector("#cinema-summary"),
  dateEndFilter: document.querySelector("#date-end-filter"),
  dateStartFilter: document.querySelector("#date-start-filter"),
  dialog: document.querySelector("#movie-dialog"),
  dialogBackdrop: document.querySelector("#movie-dialog-backdrop"),
  dialogClose: document.querySelector("#movie-dialog .dialog-close"),
  dialogCast: document.querySelector("#movie-dialog-cast"),
  dialogKicker: document.querySelector("#movie-dialog-kicker"),
  dialogMeta: document.querySelector("#movie-dialog-meta"),
  dialogFacts: document.querySelector("#movie-dialog-facts"),
  dialogActions: document.querySelector("#movie-dialog-actions"),
  dialogMetascore: document.querySelector("#movie-dialog-metascore"),
  dialogTomatoes: document.querySelector("#movie-dialog-tomatoes"),
  dialogOverview: document.querySelector("#movie-dialog-overview"),
  dialogOverviewText: document.querySelector("#movie-dialog-overview-text"),
  dialogOverviewHeading: document.querySelector("#movie-dialog-overview-heading"),
  dialogScrollbar: document.querySelector(".dialog-scrollbar"),
  dialogScrollbarThumb: document.querySelector(".dialog-scrollbar-thumb"),
  dialogScroller: document.querySelector(".dialog-content"),
  dialogShowtimes: document.querySelector("#movie-dialog-showtimes"),
  dialogTitle: document.querySelector("#movie-dialog-title"),
  dialogTrailer: document.querySelector("#movie-dialog-trailer"),
  freshness: document.querySelector("#freshness"),
  genreFilter: document.querySelector("#genre-filter"),
  genreDropdown: document.querySelector("#genre-dropdown"),
  genreSummary: document.querySelector("#genre-summary"),
  movieGrid: document.querySelector("#movie-grid"),
  letterboxdToggle: document.querySelector("#letterboxd-toggle"),
  pageScrollbar: document.querySelector(".page-scrollbar"),
  pageScrollbarThumb: document.querySelector(".page-scrollbar-thumb"),
  periodFilter: document.querySelector("#period-filter"),
  resetFiltersButton: document.querySelector("#reset-filters-button"),
  resultCount: document.querySelector("#result-count"),
  selectedPeriodLabel: document.querySelector("#selected-period-label"),
  sortFilter: document.querySelector("#sort-filter"),
  template: document.querySelector("#movie-card-template"),
  themeColor: document.querySelector('meta[name="theme-color"]'),
  themeToggle: document.querySelector("#theme-toggle"),
};

const datePickers = new Map();
let updateDialogScrollbar = () => {};
let dialogBackdropLoadId = 0;

function setupPageScrollbar() {
  const track = elements.pageScrollbar;
  const thumb = elements.pageScrollbarThumb;
  const minimumThumbHeight = 36;
  let isDragging = false;

  function measurements() {
    const viewportHeight = document.documentElement.clientHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const maximumScroll = Math.max(0, documentHeight - viewportHeight);
    const thumbHeight = Math.max(minimumThumbHeight, viewportHeight * viewportHeight / documentHeight);
    const thumbTravel = Math.max(0, viewportHeight - thumbHeight);
    return { maximumScroll, thumbHeight, thumbTravel, viewportHeight };
  }

  function update() {
    if (isDragging) return;
    const { maximumScroll, thumbHeight, thumbTravel } = measurements();
    track.hidden = maximumScroll === 0;
    if (maximumScroll === 0) return;
    const thumbTop = window.scrollY / maximumScroll * thumbTravel;
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${thumbTop}px)`;
  }

  thumb.addEventListener("pointerdown", (event) => {
    const startY = event.clientY;
    const startThumbTop = thumb.getBoundingClientRect().top;
    isDragging = true;
    document.documentElement.classList.add("is-dragging-scrollbar");
    thumb.setPointerCapture(event.pointerId);
    event.preventDefault();

    function drag(pointerEvent) {
      const { maximumScroll, thumbTravel } = measurements();
      if (thumbTravel === 0) return;
      const thumbTop = Math.min(thumbTravel, Math.max(0, startThumbTop + pointerEvent.clientY - startY));
      thumb.style.transform = `translateY(${thumbTop}px)`;
      window.scrollTo(0, thumbTop / thumbTravel * maximumScroll);
    }

    function stop(pointerEvent) {
      isDragging = false;
      document.documentElement.classList.remove("is-dragging-scrollbar");
      thumb.releasePointerCapture(pointerEvent.pointerId);
      thumb.removeEventListener("pointermove", drag);
      thumb.removeEventListener("pointerup", stop);
      thumb.removeEventListener("pointercancel", stop);
      update();
    }

    thumb.addEventListener("pointermove", drag);
    thumb.addEventListener("pointerup", stop);
    thumb.addEventListener("pointercancel", stop);
  });

  track.addEventListener("pointerdown", (event) => {
    if (event.target === thumb) return;
    const { viewportHeight } = measurements();
    const thumbBounds = thumb.getBoundingClientRect();
    const direction = event.clientY < thumbBounds.top ? -1 : 1;
    window.scrollBy({ top: direction * viewportHeight * 0.85, behavior: "smooth" });
  });

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  new ResizeObserver(update).observe(document.body);
  update();
}

function setupDialogScrollbar() {
  const scroller = elements.dialogScroller;
  const track = elements.dialogScrollbar;
  const thumb = elements.dialogScrollbarThumb;
  const minimumThumbHeight = 36;
  let isDragging = false;

  function measurements() {
    const viewportHeight = scroller.clientHeight;
    const contentHeight = scroller.scrollHeight;
    const maximumScroll = Math.max(0, contentHeight - viewportHeight);
    const thumbHeight = Math.max(minimumThumbHeight, viewportHeight * viewportHeight / contentHeight);
    const thumbTravel = Math.max(0, viewportHeight - thumbHeight);
    return { maximumScroll, thumbHeight, thumbTravel, viewportHeight };
  }

  updateDialogScrollbar = () => {
    if (isDragging) return;
    const { maximumScroll, thumbHeight, thumbTravel, viewportHeight } = measurements();
    track.hidden = maximumScroll === 0;
    if (maximumScroll === 0) return;
    track.style.top = `${scroller.offsetTop}px`;
    track.style.height = `${viewportHeight}px`;
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${scroller.scrollTop / maximumScroll * thumbTravel}px)`;
  };

  thumb.addEventListener("pointerdown", (event) => {
    const startY = event.clientY;
    const startThumbTop = thumb.getBoundingClientRect().top - track.getBoundingClientRect().top;
    isDragging = true;
    thumb.setPointerCapture(event.pointerId);
    event.preventDefault();

    function drag(pointerEvent) {
      const { maximumScroll, thumbTravel } = measurements();
      if (thumbTravel === 0) return;
      const thumbTop = Math.min(thumbTravel, Math.max(0, startThumbTop + pointerEvent.clientY - startY));
      thumb.style.transform = `translateY(${thumbTop}px)`;
      scroller.scrollTop = thumbTop / thumbTravel * maximumScroll;
    }

    function stop(pointerEvent) {
      isDragging = false;
      thumb.releasePointerCapture(pointerEvent.pointerId);
      thumb.removeEventListener("pointermove", drag);
      thumb.removeEventListener("pointerup", stop);
      thumb.removeEventListener("pointercancel", stop);
      updateDialogScrollbar();
    }

    thumb.addEventListener("pointermove", drag);
    thumb.addEventListener("pointerup", stop);
    thumb.addEventListener("pointercancel", stop);
  });

  track.addEventListener("pointerdown", (event) => {
    if (event.target === thumb) return;
    const { viewportHeight } = measurements();
    const thumbBounds = thumb.getBoundingClientRect();
    const direction = event.clientY < thumbBounds.top ? -1 : 1;
    scroller.scrollBy({ top: direction * viewportHeight * 0.85, behavior: "smooth" });
  });

  scroller.addEventListener("scroll", updateDialogScrollbar, { passive: true });
  window.addEventListener("resize", updateDialogScrollbar);
  new ResizeObserver(updateDialogScrollbar).observe(scroller);
}

function applyTheme(theme, persist = false) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  elements.themeToggle.setAttribute("aria-pressed", String(isDark));
  elements.themeToggle.setAttribute("aria-label", isDark ? "Zapnúť svetlý režim" : "Zapnúť tmavý režim");
  elements.themeColor.content = isDark ? "#0f2429" : "#e8dfc8";
  if (persist) localStorage.setItem("theme", isDark ? "dark" : "light");
}

applyTheme(document.documentElement.dataset.theme || "dark");
setupPageScrollbar();
setupDialogScrollbar();

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
  return cinema.shortName || cinema.name;
}

function availableDateBounds() {
  const dates = state.program.screenings.map((screening) => dateKey(screening.startsAt)).sort();
  const today = localToday();
  const start = dates.find((date) => date >= today) || dates[0];
  return { start, end: dates.at(-1) };
}

function periodBounds() {
  const { start, end } = availableDateBounds();
  if (state.selectedPeriod === "custom") {
    return {
      start: state.selectedDateStart || start,
      end: state.selectedDateEnd || end,
    };
  }
  return { start, end };
}

function tomorrowKey() {
  const tomorrow = new Date(`${localToday()}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

function nearestScreeningLabel(screening, cinemaMap) {
  const date = dateKey(screening.startsAt);
  const day = date === localToday() ? "Dnes"
    : date === tomorrowKey() ? "Zajtra" : formatDay(date, "long");
  const cinema = cinemaMap.get(screening.cinemaId);
  return [ `${day} ${timeValue(screening.startsAt)}`, cinema ? cinemaName(cinema) : null ]
    .filter(Boolean)
    .join(" · ");
}

function formatPickerValue(date) {
  return new Intl.DateTimeFormat("sk-SK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function closeDatePickers(exceptInput = null) {
  for (const [input, picker] of datePickers) {
    if (input === exceptInput) continue;
    picker.popover.hidden = true;
    picker.trigger.setAttribute("aria-expanded", "false");
  }
}

function setupDatePicker(input) {
  const root = input.closest(".date-picker");
  const trigger = root.querySelector(".date-picker-trigger");
  const value = root.querySelector(".date-picker-value");
  const popover = root.querySelector(".date-picker-popover");
  const picker = { popover, root, trigger, value, viewDate: null };
  datePickers.set(input, picker);

  const sync = () => {
    value.textContent = input.value ? formatPickerValue(input.value) : "Vyber dátum";
    trigger.classList.toggle("is-filled", Boolean(input.value));
  };

  const render = () => {
    const current = picker.viewDate;
    const year = current.getFullYear();
    const month = current.getMonth();
    const monthStart = isoDate(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const monthEnd = isoDate(lastOfMonth.getFullYear(), lastOfMonth.getMonth(), lastOfMonth.getDate());
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    const firstCell = new Date(year, month, 1 - offset);
    const monthLabel = new Intl.DateTimeFormat("sk-SK", { month: "long", year: "numeric" }).format(current);
    const weekdays = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

    popover.innerHTML = `
      <span class="date-picker-header">
        <button class="date-picker-nav" type="button" data-month-step="-1" aria-label="Predchádzajúci mesiac">←</button>
        <span class="date-picker-month" aria-live="polite">${monthLabel}</span>
        <button class="date-picker-nav" type="button" data-month-step="1" aria-label="Nasledujúci mesiac">→</button>
      </span>
      <span class="date-picker-weekdays" aria-hidden="true">${weekdays.map((day) => `<span>${day}</span>`).join("")}</span>
      <span class="date-picker-days"></span>`;

    const previous = popover.querySelector('[data-month-step="-1"]');
    const next = popover.querySelector('[data-month-step="1"]');
    previous.disabled = Boolean(input.min && monthStart <= input.min);
    next.disabled = Boolean(input.max && monthEnd >= input.max);
    const days = popover.querySelector(".date-picker-days");

    for (let index = 0; index < 42; index += 1) {
      const cellDate = new Date(firstCell);
      cellDate.setDate(firstCell.getDate() + index);
      const date = isoDate(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());
      const button = document.createElement("button");
      button.className = "date-picker-day";
      button.type = "button";
      button.textContent = String(cellDate.getDate());
      button.dataset.date = date;
      button.disabled = Boolean((input.min && date < input.min) || (input.max && date > input.max));
      button.classList.toggle("is-outside", cellDate.getMonth() !== month);
      button.classList.toggle("is-today", date === localToday());
      button.classList.toggle("is-selected", date === input.value);
      button.setAttribute("aria-label", formatDay(date, "long"));
      button.setAttribute("aria-pressed", String(date === input.value));
      days.append(button);
    }
  };

  const open = () => {
    closeDatePickers(input);
    elements.genreDropdown.open = false;
    elements.cinemaDropdown.open = false;
    const initial = input.value || input.min || localToday();
    const [year, month] = initial.split("-").map(Number);
    picker.viewDate = new Date(year, month - 1, 1);
    render();
    popover.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  };

  trigger.addEventListener("click", () => {
    if (popover.hidden) open();
    else closeDatePickers();
  });

  popover.addEventListener("click", (event) => {
    const day = event.target.closest("[data-date]");
    if (day && !day.disabled) {
      input.value = input.value === day.dataset.date ? "" : day.dataset.date;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      closeDatePickers();
      trigger.focus();
      return;
    }
    const navigation = event.target.closest("[data-month-step]");
    if (!navigation || navigation.disabled) return;
    const step = Number(navigation.dataset.monthStep);
    picker.viewDate = new Date(picker.viewDate.getFullYear(), picker.viewDate.getMonth() + step, 1);
    render();
    popover.querySelector(`[data-month-step="${step}"]`).focus();
  });

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || popover.hidden) return;
    event.preventDefault();
    closeDatePickers();
    trigger.focus();
  });

  picker.sync = sync;
  picker.render = render;
  sync();
}

function setupDatePickers() {
  setupDatePicker(elements.dateStartFilter);
  setupDatePicker(elements.dateEndFilter);
}

function periodLabel() {
  const { start, end } = periodBounds();
  if (state.selectedPeriod === "custom") {
    if (!state.selectedDateStart) return `Do ${formatDay(end, "long")}`;
    if (!state.selectedDateEnd) return `Od ${formatDay(start, "long")}`;
    if (start === end) return start === localToday() ? "Dnes" : formatDay(start, "long");
    return `${formatDay(start, "long")} – ${formatDay(end, "long")}`;
  }
  return `Celý program · ${formatDay(start, "long")} – ${formatDay(end, "long")}`;
}

function renderPeriods() {
  for (const button of elements.periodFilter.querySelectorAll("[data-period]")) {
    const isActive = button.dataset.period === state.selectedPeriod;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
  elements.dateStartFilter.value = state.selectedDateStart;
  elements.dateEndFilter.value = state.selectedDateEnd;
  elements.dateEndFilter.min = state.selectedDateStart || elements.dateStartFilter.min;
  for (const picker of datePickers.values()) picker.sync();
}

function configureDateFilters() {
  const { start, end } = availableDateBounds();
  for (const input of [elements.dateStartFilter, elements.dateEndFilter]) {
    input.min = start;
    input.max = end;
  }
}

function renderGenres() {
  const genres = availableGenres();
  state.selectedGenres = new Set([...state.selectedGenres].filter((genre) => genres.includes(genre)));
  elements.genreFilter.replaceChildren(...["all", ...genres].map((genre) => {
    const label = document.createElement("label");
    label.className = "filter-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = genre;
    const optionLabel = genre === "all" ? "Všetky žánre" : genre;
    checkbox.setAttribute("aria-label", optionLabel);
    label.append(checkbox, document.createTextNode(optionLabel));
    return label;
  }));
  updateGenreSelection();
}

function availableGenres() {
  return [...new Set(state.program.movies.flatMap((movie) => movie.genres || []))]
    .sort((a, b) => a.localeCompare(b, "sk"));
}

function updateGenreSelection() {
  const genres = availableGenres();
  const allSelected = state.selectedGenres.size === genres.length;
  for (const checkbox of elements.genreFilter.querySelectorAll("input")) {
    checkbox.checked = checkbox.value === "all" ? allSelected : state.selectedGenres.has(checkbox.value);
  }
  const selected = [...state.selectedGenres];
  elements.genreSummary.textContent = allSelected ? "Všetky žánre"
    : selected.length === 0 ? "Žiadny žáner"
    : selected.length === 1 ? selected[0] : `Žánre (${selected.length})`;
  elements.genreSummary.title = selected.join(", ");
}

function renderCinemas() {
  elements.cinemaFilter.replaceChildren(...[null, ...state.program.cinemas].map((cinema) => {
    const label = document.createElement("label");
    label.className = "filter-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = cinema?.id || "all";
    const optionLabel = cinema ? cinemaName(cinema) : "Všetky kiná";
    checkbox.setAttribute("aria-label", optionLabel);
    label.append(checkbox, document.createTextNode(optionLabel));
    return label;
  }));
  updateCinemaSelection();
}

function updateCinemaSelection() {
  const allSelected = state.selectedCinemas.size === state.program.cinemas.length;
  for (const checkbox of elements.cinemaFilter.querySelectorAll("input")) {
    checkbox.checked = checkbox.value === "all" ? allSelected : state.selectedCinemas.has(checkbox.value);
  }
  const selected = state.program.cinemas.filter((cinema) => state.selectedCinemas.has(cinema.id));
  elements.cinemaSummary.textContent = allSelected ? "Všetky kiná"
    : selected.length === 0 ? "Žiadne kino"
      : selected.length === 1 ? cinemaName(selected[0]) : `Kiná (${selected.length})`;
  elements.cinemaSummary.title = selected.map(cinemaName).join(", ");
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

function groupByDate(screenings) {
  const groups = new Map();
  for (const screening of screenings) {
    const date = dateKey(screening.startsAt);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(screening);
  }
  return groups;
}

function showtimeElement(screening, movie) {
  const element = document.createElement(movie.detailUrl && !screening.soldOut ? "a" : "span");
  element.className = `showtime${screening.soldOut ? " is-sold-out" : ""}`;
  element.textContent = timeValue(screening.startsAt);
  element.title = screening.soldOut
    ? "Vypredané"
    : [screening.auditorium, screening.format?.join(" · ")].filter(Boolean).join(" · ") || "Zobraziť kartu filmu";
  if (element instanceof HTMLAnchorElement) {
    element.href = movie.detailUrl;
    element.target = "_blank";
    element.rel = "noreferrer";
    element.setAttribute("aria-label", `${timeValue(screening.startsAt)} — zobraziť kartu filmu`);
  }
  return element;
}

function movieMeta(movie) {
  return [
    movie.directors?.length ? `Réžia: ${movie.directors.join(", ")}` : null,
    movie.durationMinutes ? formatDuration(movie.durationMinutes) : null,
    movie.releaseYear || null,
    (movie.originalTitle || movie.englishTitle) !== movie.title ? (movie.originalTitle || movie.englishTitle) : null,
  ].filter(Boolean).join(" · ");
}

function renderShowtimes(movie, screenings, cinemaMap, root) {
  root.replaceChildren();
  const byDate = groupByDate([...screenings].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));

  for (const [date, dateScreenings] of byDate) {
    const day = document.createElement("section");
    day.className = "showtime-day";
    const heading = document.createElement("h4");
    heading.className = "showtime-date";
    heading.textContent = date === localToday() ? "Dnes" : formatDay(date, "long");
    day.append(heading);

    for (const [cinemaId, cinemaScreenings] of groupByCinema(dateScreenings)) {
      const group = document.createElement("div");
      group.className = "showtime-group";
      const label = document.createElement("span");
      label.className = "cinema-name";
      label.textContent = cinemaName(cinemaMap.get(cinemaId));
      const times = document.createElement("div");
      times.className = "showtimes";
      times.replaceChildren(...cinemaScreenings.map((screening) => showtimeElement(screening, movie)));
      group.append(label, times);
      day.append(group);
    }
    root.append(day);
  }
}

function oscarLabel(wins) {
  return `${wins} ${wins === 1 ? "Oscar" : wins < 5 ? "Oscary" : "Oscarov"}`;
}

function renderMovieFacts(movie) {
  const meta = elements.dialogMetascore;
  meta.hidden = !Number.isFinite(movie.metascore);
  meta.className = `critic-score metascore is-${metascoreTone(movie.metascore)}`;
  meta.textContent = meta.hidden ? "" : movie.metascore;
  meta.title = `Metascore: ${movie.metascore}/100 · Vážené hodnotenie filmových kritikov`;
  meta.setAttribute("aria-label", meta.title);
  const tomatoes = elements.dialogTomatoes;
  tomatoes.hidden = !Number.isFinite(movie.rottenTomatoesRating);
  const tone = tomatoTone(movie.rottenTomatoesRating);
  tomatoes.className = `critic-score tomatoes is-${tone}`;
  tomatoes.querySelector(".tomato-value").textContent = tomatoes.hidden ? "" : `${movie.rottenTomatoesRating} %`;
  tomatoes.title = `Rotten Tomatoes: ${movie.rottenTomatoesRating} % pozitívnych recenzií kritikov · ${tone === "fresh" ? "Fresh" : "Rotten"}`;
  tomatoes.setAttribute("aria-label", tomatoes.title);
  const facts = [
    { label: "Oscary", value: movie.oscarWins > 0 ? oscarLabel(movie.oscarWins) : null, style: "is-oscar" },
    { label: "Tržby (USA a Kanada)", value: Number.isFinite(movie.boxOfficeUsd)
      ? new Intl.NumberFormat("sk-SK", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(movie.boxOfficeUsd) : null,
      title: "Tržby v USA a Kanade podľa OMDb, v amerických dolároch" },
  ].filter((fact) => fact.value !== null);
  elements.dialogFacts.replaceChildren(...facts.map((fact) => {
    const item = document.createElement("div");
    item.className = `dialog-fact ${fact.style || ""}`.trim();
    if (fact.title) item.title = fact.title;
    const label = document.createElement("dt");
    label.textContent = fact.label;
    const value = document.createElement("dd");
    value.textContent = fact.value;
    item.append(label, value);
    return item;
  }));
  elements.dialogFacts.hidden = facts.length === 0;
  elements.dialogActions.hidden = !movie.trailerUrl && meta.hidden && tomatoes.hidden && facts.length === 0;
}

function clearDialogBackdrop() {
  dialogBackdropLoadId += 1;
  elements.dialog.classList.remove("has-backdrop");
  elements.dialogBackdrop.classList.remove("is-loaded");
  elements.dialogBackdrop.hidden = true;
  elements.dialogBackdrop.onload = null;
  elements.dialogBackdrop.onerror = null;
  elements.dialogBackdrop.removeAttribute("src");
}

function loadDialogBackdrop(url) {
  clearDialogBackdrop();
  if (!url) return;

  const loadId = dialogBackdropLoadId;
  const reveal = () => {
    if (loadId !== dialogBackdropLoadId || elements.dialogBackdrop.getAttribute("src") !== url) return;
    elements.dialogBackdrop.classList.add("is-loaded");
  };
  const discard = () => {
    if (loadId === dialogBackdropLoadId) clearDialogBackdrop();
  };

  elements.dialog.classList.add("has-backdrop");
  elements.dialogBackdrop.hidden = false;
  elements.dialogBackdrop.onload = reveal;
  elements.dialogBackdrop.onerror = discard;
  elements.dialogBackdrop.src = url;
  if (elements.dialogBackdrop.complete) {
    if (elements.dialogBackdrop.naturalWidth) reveal();
    else discard();
  }
}

function openMovieDialog(movie, screenings, cinemaMap, updateRoute = true) {
  if (updateRoute) {
    const url = new URL(window.location.href);
    url.hash = `film=${encodeURIComponent(movie.id)}`;
    if (url.href !== window.location.href) window.history.pushState(null, "", url);
  }
  loadDialogBackdrop(movie.backdropUrl);
  elements.dialogKicker.textContent = movie.genres?.slice(0, 2).join(" · ") || "Film";
  elements.dialogTitle.textContent = movie.title;
  elements.dialogMeta.textContent = movieMeta(movie);
  renderMovieFacts(movie);
  elements.dialogCast.hidden = !movie.actors?.length;
  elements.dialogCast.textContent = movie.actors?.length ? `Hrajú: ${movie.actors.join(", ")}` : "";
  elements.dialogOverview.hidden = !movie.overview;
  elements.dialogOverviewText.textContent = movie.overview || "";
  elements.dialogOverviewText.lang = movie.overviewLanguage || "sk";
  elements.dialogOverviewHeading.textContent = movie.overviewLanguage === "en" ? "O filme · anglicky"
    : movie.overviewLanguage === "cs" ? "O filme · česky" : "O filme";
  elements.dialogTrailer.hidden = !movie.trailerUrl;
  if (movie.trailerUrl) elements.dialogTrailer.href = movie.trailerUrl;
  else elements.dialogTrailer.removeAttribute("href");
  renderShowtimes(movie, screenings, cinemaMap, elements.dialogShowtimes);
  elements.dialogScroller.scrollTop = 0;
  if (typeof elements.dialog.showModal === "function") elements.dialog.showModal();
  else elements.dialog.setAttribute("open", "");
  document.body.classList.add("has-open-dialog");
  requestAnimationFrame(updateDialogScrollbar);
}

function clearMovieRoute() {
  if (!window.location.hash.startsWith("#film=")) return;
  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(null, "", url);
}

function closeMovieDialog() {
  clearMovieRoute();
  if (typeof elements.dialog.close === "function") elements.dialog.close();
  else elements.dialog.removeAttribute("open");
  clearDialogBackdrop();
  document.body.classList.remove("has-open-dialog");
}

function syncMovieRoute() {
  if (!state.program) return;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const movieId = params.get("film");
  const movie = state.program.movies.find((item) => item.id === movieId);
  if (!movie) {
    closeMovieDialog();
    return;
  }
  const screenings = state.program.screenings.filter((screening) => (
    screening.movieId === movie.id && new Date(screening.startsAt).getTime() > Date.now()
  ));
  const cinemaMap = new Map(state.program.cinemas.map((cinema) => [cinema.id, cinema]));
  openMovieDialog(movie, screenings, cinemaMap, false);
  if (screenings.length === 0) {
    elements.dialogShowtimes.textContent = "Tento film momentálne nemá naplánované premietania.";
  }
}

function renderMovie(movie, screenings, cinemaMap) {
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector(".movie-card");
  const poster = fragment.querySelector(".poster");
  const ratingsElement = fragment.querySelector(".movie-ratings");
  const screeningCount = fragment.querySelector(".screening-count");
  const oscarBadge = fragment.querySelector(".oscar-badge");
  oscarBadge.hidden = !(movie.oscarWins > 0);
  if (movie.oscarWins > 0) {
    const label = `Získané ocenenia: ${oscarLabel(movie.oscarWins)}`;
    oscarBadge.title = label;
    oscarBadge.setAttribute("aria-label", label);
    oscarBadge.querySelector("span").textContent = movie.oscarWins;
  }

  fragment.querySelector("h3").textContent = movie.title;
  fragment.querySelector(".movie-kicker").textContent = movie.genres?.slice(0, 2).join(" · ") || "Film";
  fragment.querySelector(".movie-meta").textContent = movieMeta(movie);
  const nearestScreening = [...screenings].sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const countLabel = `${screenings.length} ${screenings.length === 1 ? "predstavenie" : screenings.length < 5 ? "predstavenia" : "predstavení"}`;
  screeningCount.textContent = `${countLabel} · ${nearestScreeningLabel(nearestScreening, cinemaMap)}`;

  if (movie.posterUrl) {
    poster.src = movie.posterUrl;
    poster.alt = `Plagát filmu ${movie.title}`;
    poster.addEventListener("error", () => poster.classList.add("is-broken"));
  }
  card.dataset.movieId = movie.id;
  const ratings = [
    { source: "ČSFD", score: movie.csfdRating, max: 100, votes: movie.csfdVotes, url: movie.csfdId ? `https://www.csfd.cz/film/${movie.csfdId}/` : null },
    { source: "IMDb", score: movie.imdbRating, max: 10, votes: movie.imdbVotes, url: movie.imdbId ? `https://www.imdb.com/title/${movie.imdbId}/` : null },
  ];
  for (const rating of ratings) {
    if (!rating.url) continue;
    const hasRating = Number.isFinite(rating.score);
    const score = hasRating ? (rating.max === 10 ? rating.score.toFixed(1) : Math.round(rating.score).toLocaleString("sk-SK")) : null;
    const ratingElement = document.createElement(rating.url ? "a" : "span");
    ratingElement.className = "movie-rating";
    const sourceIcon = document.createElement("span");
    sourceIcon.className = `rating-source ${rating.source === "IMDb" ? "is-imdb" : "is-csfd"}`;
    sourceIcon.setAttribute("aria-hidden", "true");
    sourceIcon.textContent = rating.source;
    ratingElement.append(sourceIcon, hasRating ? `${score}${rating.max === 100 ? " %" : ""}` : "—");
    ratingElement.title = !hasRating
      ? `${rating.source}: hodnotenie nie je dostupné`
      : rating.votes
      ? `${rating.source} hodnotenie z ${rating.votes.toLocaleString("sk-SK")} hlasov`
      : `${rating.source} hodnotenie`;
    ratingElement.setAttribute("aria-label", hasRating
      ? `${movie.title}: ${rating.source} hodnotenie ${score} z ${rating.max}`
      : `${movie.title}: ${rating.source} hodnotenie nie je dostupné`);
    if (rating.url) {
      ratingElement.href = rating.url;
      ratingElement.target = "_blank";
      ratingElement.rel = "noreferrer";
    }
    ratingsElement.append(ratingElement);
  }
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `${movie.title} — zobraziť termíny premietania`);
  card.addEventListener("click", (event) => {
    if (event.target.closest("a, button")) return;
    openMovieDialog(movie, screenings, cinemaMap);
  });
  card.addEventListener("keydown", (event) => {
    if (event.target.closest("a, button")) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openMovieDialog(movie, screenings, cinemaMap);
  });
  return fragment;
}

function renderProgram() {
  const movieMap = new Map(state.program.movies.map((movie) => [movie.id, movie]));
  const cinemaMap = new Map(state.program.cinemas.map((cinema) => [cinema.id, cinema]));
  const { start, end } = periodBounds();
  const moviesInGenre = new Set(state.program.movies
    .filter((movie) => state.selectedGenres.size === availableGenres().length || movie.genres?.some((genre) => state.selectedGenres.has(genre)))
    .map((movie) => movie.id));
  const czSkMovieIds = new Set(state.program.screenings
    .filter((screening) => isCzSkMovie(movieMap.get(screening.movieId), screening))
    .map((screening) => screening.movieId));
  const now = Date.now();
  const recentlyAddedSince = Date.parse(state.program.generatedAt) - RECENTLY_ADDED_DAYS * 86_400_000;
  const visible = state.program.screenings.filter((screening) => {
    const date = dateKey(screening.startsAt);
    const movie = movieMap.get(screening.movieId);
    const releaseYear = Number.parseInt(movie?.releaseYear, 10);
    const firstSeenAt = Date.parse(movie?.firstSeenAt);
    return new Date(screening.startsAt).getTime() > now
      && date >= start && date <= end
      && state.selectedCinemas.has(screening.cinemaId)
      && moviesInGenre.has(screening.movieId)
      && (state.sortBy !== "czSk" || czSkMovieIds.has(screening.movieId))
      && (state.sortBy !== "cult" || (Number.isFinite(releaseYear) && releaseYear <= CULT_MOVIE_LATEST_YEAR))
      && (state.sortBy !== "added" || (Number.isFinite(firstSeenAt) && firstSeenAt >= recentlyAddedSince))
      && (state.sortBy !== "mustWatch" || isMustWatch(movie))
      && (state.sortBy !== "oscars" || isOscarWinner(movie));
  });
  const grouped = groupScreenings(visible);
  elements.selectedPeriodLabel.textContent = periodLabel();
  elements.resultCount.textContent = `${grouped.size} ${grouped.size === 1 ? "film" : grouped.size < 5 ? "filmy" : "filmov"} · ${visible.length} predstavení`;

  if (visible.length === 0) {
    elements.movieGrid.innerHTML = `
      <div class="empty-state">
        <div><h3>Tomuto výberu nič nezodpovedá</h3><p>Skús dlhšie obdobie, iný žáner alebo zapni ďalšie kino.</p></div>
      </div>`;
    return;
  }

  const cards = [...grouped.entries()]
    .map(([movieId, screenings]) => ({ movie: movieMap.get(movieId), screenings }))
    .filter(({ movie }) => movie)
    .sort((a, b) => {
      if (["rating", "cult", "mustWatch", "czSk", "oscars"].includes(state.sortBy)) {
        return compareMoviesByRating(a.movie, b.movie);
      }
      if (state.sortBy === "added") {
        return Date.parse(b.movie.firstSeenAt) - Date.parse(a.movie.firstSeenAt)
          || a.movie.title.localeCompare(b.movie.title, "sk");
      }
      if (state.sortBy === "shortest" || state.sortBy === "longest") {
        return compareMoviesByDuration(a.movie, b.movie, state.sortBy);
      }
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
    const failedSourceNames = failedSources.map((source) => {
      const cinema = state.program.cinemas.find((item) => (
        item.id === source.id || `kino-${item.id}` === source.id
      ));
      return cinema?.shortName || cinema?.name || source.id;
    });
    const failureLabel = failedSources.length === 1 ? "zlyhal zdroj" : "zlyhali zdroje";
    dot.classList.add("is-error");
    label.textContent = `Aktualizované ${formatUpdated(state.program.generatedAt)} · ${failureLabel}: ${failedSourceNames.join(", ")}`;
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

  const availableCinemas = new Set(state.program.cinemas.map((cinema) => cinema.id));
  const availableGenres = new Set(state.program.movies.flatMap((movie) => movie.genres || []));

  try {
    void Promise.resolve(context.registerTool({
      name: "filter_program",
      title: "Filtrovať program kín",
      description: "Filtruje filmy, ktoré práve hrajú, podľa obdobia, kín, žánru a krajiny výroby a zmení ich poradie.",
      inputSchema: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["all", "custom"], description: "Celý program alebo vlastné obdobie." },
          startDate: { type: "string", description: "Začiatok rozsahu vo formáte RRRR-MM-DD." },
          endDate: { type: "string", description: "Koniec rozsahu vo formáte RRRR-MM-DD." },
          cinemaIds: {
            type: "array",
            items: { type: "string", enum: [...availableCinemas] },
            description: "ID kín, ktoré majú zostať viditeľné."
          },
          genre: { type: "string", enum: ["all", ...availableGenres], description: "Vybraný žáner alebo all." },
          genres: { type: "array", items: { type: "string", enum: [...availableGenres] }, description: "Vybrané žánre (stačí zhoda s jedným); prázdny zoznam zobrazí všetky. Má prednosť pred genre." },
          sortBy: { type: "string", enum: ["rating", "mustWatch", "oscars", "czSk", "shortest", "longest", "cult", "added", "soonest"], description: "rating zoradí podľa hodnotenia zo zdroja s väčším počtom hlasov; mustWatch zobrazí iba filmy s IMDb hodnotením aspoň 8; oscars zobrazí iba víťazov Oscara zoradených podľa hodnotenia; czSk zobrazí české, slovenské a československé filmy zoradené podľa hodnotenia; shortest a longest zoradia podľa dĺžky; cult zobrazí filmy do roku 2024 a added filmy prvýkrát zachytené za posledných 7 dní." }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input = {}) {
        if (input.cinemaIds !== undefined && (!Array.isArray(input.cinemaIds) || input.cinemaIds.some((id) => !availableCinemas.has(id)))) {
          throw new Error("Zoznam obsahuje neznáme kino.");
        }
        if (input.genre !== undefined && input.genre !== "all" && !availableGenres.has(input.genre)) throw new Error("Neznámy žáner.");
        if (input.genres !== undefined && (!Array.isArray(input.genres) || input.genres.some((genre) => !availableGenres.has(genre)))) throw new Error("Neznámy žáner.");
        const datePattern = /^\d{4}-\d{2}-\d{2}$/;
        if (input.startDate !== undefined && !datePattern.test(input.startDate)) throw new Error("Neplatný počiatočný dátum.");
        if (input.endDate !== undefined && !datePattern.test(input.endDate)) throw new Error("Neplatný koncový dátum.");
        const nextStart = input.startDate ?? state.selectedDateStart;
        const nextEnd = input.endDate ?? state.selectedDateEnd;
        if (input.period === "custom" && !nextStart && !nextEnd) throw new Error("Vlastné obdobie potrebuje aspoň jeden dátum.");
        if (nextStart && nextEnd && nextEnd < nextStart) throw new Error("Koniec obdobia musí byť po jeho začiatku.");
        if (input.period === "all") {
          state.selectedPeriod = "all";
          state.selectedDateStart = "";
          state.selectedDateEnd = "";
        } else if (input.period === "custom" || input.startDate || input.endDate) {
          state.selectedPeriod = "custom";
          if (input.startDate !== undefined) state.selectedDateStart = input.startDate;
          if (input.endDate !== undefined) state.selectedDateEnd = input.endDate;
        }
        if (input.cinemaIds) state.selectedCinemas = new Set(input.cinemaIds);
        if (input.genre) state.selectedGenres = input.genre === "all" ? new Set(availableGenres) : new Set([input.genre]);
        if (input.genres) state.selectedGenres = input.genres.length === 0 ? new Set(availableGenres) : new Set(input.genres);
        if (input.sortBy) state.sortBy = input.sortBy;
        updateGenreSelection();
        elements.sortFilter.value = state.sortBy;
        renderPeriods();
        renderCinemas();
        renderProgram();
        return {
          period: state.selectedPeriod,
          startDate: state.selectedDateStart || null,
          endDate: state.selectedDateEnd || null,
          cinemaIds: [...state.selectedCinemas],
          genres: [...state.selectedGenres],
          sortBy: state.sortBy
        };
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
    state.selectedCinemas = new Set(state.program.cinemas.map((cinema) => cinema.id));
    state.selectedGenres = new Set(availableGenres());
    configureDateFilters();
    setupDatePickers();
    renderFreshness();
    renderPeriods();
    renderGenres();
    renderCinemas();
    renderProgram();
    syncMovieRoute();
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

elements.periodFilter.addEventListener("click", (event) => {
  const button = event.target.closest("[data-period]");
  if (!button) return;
  state.selectedPeriod = button.dataset.period;
  state.selectedDateStart = "";
  state.selectedDateEnd = "";
  renderPeriods();
  renderProgram();
});

elements.dateStartFilter.addEventListener("change", () => {
  state.selectedDateStart = elements.dateStartFilter.value;
  if (state.selectedDateStart && state.selectedDateEnd && state.selectedDateEnd < state.selectedDateStart) {
    state.selectedDateEnd = "";
  }
  state.selectedPeriod = state.selectedDateStart || state.selectedDateEnd ? "custom" : "all";
  renderPeriods();
  renderProgram();
});

elements.dateEndFilter.addEventListener("change", () => {
  state.selectedDateEnd = elements.dateEndFilter.value;
  state.selectedPeriod = state.selectedDateStart || state.selectedDateEnd ? "custom" : "all";
  renderPeriods();
  renderProgram();
});

elements.genreFilter.addEventListener("change", (event) => {
  const checkbox = event.target;
  if (!(checkbox instanceof HTMLInputElement)) return;
  if (checkbox.value === "all") {
    state.selectedGenres.clear();
    if (checkbox.checked) availableGenres().forEach((genre) => state.selectedGenres.add(genre));
  }
  else if (checkbox.checked) state.selectedGenres.add(checkbox.value);
  else state.selectedGenres.delete(checkbox.value);
  updateGenreSelection();
  renderProgram();
});

elements.cinemaFilter.addEventListener("change", (event) => {
  const checkbox = event.target;
  if (!(checkbox instanceof HTMLInputElement)) return;
  if (checkbox.value === "all") {
    state.selectedCinemas.clear();
    if (checkbox.checked) state.program.cinemas.forEach((cinema) => state.selectedCinemas.add(cinema.id));
  } else if (checkbox.checked) {
    state.selectedCinemas.add(checkbox.value);
  } else {
    state.selectedCinemas.delete(checkbox.value);
  }
  updateCinemaSelection();
  renderProgram();
});

document.addEventListener("click", (event) => {
  if (!elements.genreDropdown.contains(event.target)) elements.genreDropdown.open = false;
  if (!elements.cinemaDropdown.contains(event.target)) elements.cinemaDropdown.open = false;
  if (!event.target.closest(".date-picker")) closeDatePickers();
});

for (const dropdown of [elements.cinemaDropdown, elements.genreDropdown]) {
  dropdown.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    dropdown.open = false;
    dropdown.querySelector("summary").focus();
  });
}

elements.sortFilter.addEventListener("change", () => {
  state.sortBy = elements.sortFilter.value;
  renderProgram();
});

elements.resetFiltersButton.addEventListener("click", () => {
  state.selectedPeriod = "all";
  state.selectedDateStart = "";
  state.selectedDateEnd = "";
  state.selectedGenres = new Set(availableGenres());
  state.sortBy = "rating";
  state.selectedCinemas = new Set(state.program.cinemas.map((cinema) => cinema.id));
  updateGenreSelection();
  elements.sortFilter.value = "rating";
  renderPeriods();
  renderCinemas();
  renderProgram();
});

elements.themeToggle.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
});

elements.letterboxdToggle.addEventListener("click", () => {
  const isLetterboxd = elements.movieGrid.classList.toggle("is-letterboxd");
  elements.letterboxdToggle.setAttribute("aria-pressed", String(isLetterboxd));
});

elements.dialogClose.addEventListener("click", closeMovieDialog);
elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) closeMovieDialog();
});
elements.dialog.addEventListener("close", () => {
  if (elements.dialog.hasAttribute("open")) return;
  clearMovieRoute();
  clearDialogBackdrop();
  document.body.classList.remove("has-open-dialog");
});
window.addEventListener("popstate", syncMovieRoute);
window.addEventListener("hashchange", syncMovieRoute);
elements.dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeMovieDialog();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.dialog.hasAttribute("open")) closeMovieDialog();
});

init();
