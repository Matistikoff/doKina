import { countryFlag, countryFlagPath, countryName, formatDuration, formatUsd } from "./formatters.js";
import { compareMoviesByDuration, isMustWatch, isOscarWinner } from "./discovery.js";
import { metascoreTone, tomatoTone } from "./critic-ratings.js";
import { isCzSkMovie, isNonEnglishMovie, matchesSelectedGenres } from "./filters.js";
import {
  actorSearchUrl,
  directorSearchUrl,
  metacriticMovieUrl,
  movieDetailUrl,
  rottenTomatoesMovieUrl,
} from "./links.js";
import { limitedMovieCast } from "./movie-cast.js";
import { alternativeMovieTitle } from "./movie-title.js";
import { compareMoviesByRating } from "./ratings.js";

const CULT_MOVIE_LATEST_YEAR = 2024;
const RECENTLY_ADDED_DAYS = 7;
const FAVORITES_STORAGE_KEY = "dokina-favorite-movies";

function loadFavoriteMovieIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

const state = {
  program: null,
  selectedPeriod: "all",
  selectedDateStart: "",
  selectedDateEnd: "",
  selectedCinemas: new Set(),
  selectedGenres: new Set(),
  genreMatchMode: "any",
  favoriteMovieIds: loadFavoriteMovieIds(),
  showFavoritesOnly: false,
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
  dialogRatings: document.querySelector("#movie-dialog-ratings"),
  dialogFacts: document.querySelector("#movie-dialog-facts"),
  dialogFinancials: document.querySelector("#movie-dialog-financials"),
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
  favoritesFilterButton: document.querySelector("#favorites-filter-button"),
  genreFilter: document.querySelector("#genre-filter"),
  genreDropdown: document.querySelector("#genre-dropdown"),
  genreMatchAll: document.querySelector("#genre-match-all"),
  genreSummary: document.querySelector("#genre-summary"),
  installDialog: document.querySelector("#install-dialog"),
  installDialogClose: document.querySelector("#install-dialog-close"),
  installPlatformPanels: [...document.querySelectorAll("[data-install-panel]")],
  installPlatformTabs: [...document.querySelectorAll("[data-install-platform]")],
  installToggle: document.querySelector("#install-toggle"),
  movieGrid: document.querySelector("#movie-grid"),
  letterboxdToggle: document.querySelector("#letterboxd-toggle"),
  pageScrollbar: document.querySelector(".page-scrollbar"),
  pageScrollbarThumb: document.querySelector(".page-scrollbar-thumb"),
  periodFilter: document.querySelector("#period-filter"),
  resetFiltersButton: document.querySelector("#reset-filters-button"),
  resultCount: document.querySelector("#result-count"),
  selectedPeriodLabel: document.querySelector("#selected-period-label"),
  sortDropdown: document.querySelector("#sort-dropdown"),
  sortFilter: document.querySelector("#sort-filter"),
  sortOptions: document.querySelector("#sort-options"),
  sortSummary: document.querySelector("#sort-summary"),
  template: document.querySelector("#movie-card-template"),
  themeColor: document.querySelector('meta[name="theme-color"]'),
  themeToggle: document.querySelector("#theme-toggle"),
};

let datePicker = null;
const dialogBackdropPreloads = new Map();
let updateDialogScrollbar = () => {};
let dialogBackdropLoadId = 0;

function saveFavoriteMovieIds() {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...state.favoriteMovieIds]));
  } catch (error) {
    console.warn("Obľúbené filmy sa nepodarilo uložiť", error);
  }
}

function updateFavoritesFilter() {
  const count = state.favoriteMovieIds.size;
  elements.favoritesFilterButton.classList.toggle("is-active", state.showFavoritesOnly);
  elements.favoritesFilterButton.setAttribute("aria-pressed", String(state.showFavoritesOnly));
  elements.favoritesFilterButton.setAttribute(
    "aria-label",
    `${state.showFavoritesOnly ? "Zobrazené" : "Zobraziť"} obľúbené filmy (${count})`,
  );
  elements.favoritesFilterButton.querySelector(".favorites-filter-count").textContent = count;
}

function updateFavoriteButton(button, movie) {
  const isFavorite = state.favoriteMovieIds.has(movie.id);
  button.classList.toggle("is-favorite", isFavorite);
  button.setAttribute("aria-pressed", String(isFavorite));
  button.setAttribute(
    "aria-label",
    `${isFavorite ? "Odobrať" : "Pridať"} film ${movie.title} ${isFavorite ? "z obľúbených" : "do obľúbených"}`,
  );
  button.title = isFavorite ? "Odobrať z obľúbených" : "Pridať do obľúbených";
}

function toggleFavorite(movie, button) {
  if (state.favoriteMovieIds.has(movie.id)) state.favoriteMovieIds.delete(movie.id);
  else state.favoriteMovieIds.add(movie.id);
  saveFavoriteMovieIds();
  updateFavoriteButton(button, movie);
  updateFavoritesFilter();
  if (state.showFavoritesOnly) renderProgram();
}

function preloadDialogBackdrop(url) {
  if (!url || dialogBackdropPreloads.has(url)) return;
  const image = new Image();
  image.decoding = "async";
  image.fetchPriority = "high";
  image.addEventListener("error", () => dialogBackdropPreloads.delete(url), { once: true });
  image.src = url;
  dialogBackdropPreloads.set(url, image);
}

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

function setupSmoothWheelScrolling() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function enhance(scroller) {
    const isPage = scroller === window;
    const motionElement = isPage ? document.documentElement : scroller;
    let frame = 0;
    let target = 0;

    const hasNestedScroller = (eventTarget) => {
      if (!(eventTarget instanceof Element)) return false;
      let element = eventTarget;
      while (element && element !== document.body && element !== scroller) {
        const overflowY = getComputedStyle(element).overflowY;
        if ((overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight) {
          return true;
        }
        element = element.parentElement;
      }
      return false;
    };

    const currentPosition = () => isPage ? window.scrollY : scroller.scrollTop;
    const maximumPosition = () => isPage
      ? Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      : Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const setPosition = (position) => {
      if (isPage) window.scrollTo(0, position);
      else scroller.scrollTop = position;
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      target = currentPosition();
      motionElement.classList.remove("is-smooth-wheel-scrolling");
    };
    const animate = () => {
      const current = currentPosition();
      const distance = target - current;
      if (Math.abs(distance) < 0.5) {
        setPosition(target);
        frame = 0;
        motionElement.classList.remove("is-smooth-wheel-scrolling");
        return;
      }
      const easing = isPage ? 0.16 : 0.3;
      setPosition(current + distance * easing);
      frame = requestAnimationFrame(animate);
    };

    scroller.addEventListener("wheel", (event) => {
      if (
        reducedMotion.matches
        || event.ctrlKey
        || Math.abs(event.deltaX) > Math.abs(event.deltaY)
        || hasNestedScroller(event.target)
      ) return;

      // Leave precise trackpads native; add inertia only to stepped mouse wheels.
      const isSteppedWheel = event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL || Math.abs(event.deltaY) >= 40;
      if (!isSteppedWheel) {
        stop();
        return;
      }

      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 18
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? (isPage ? window.innerHeight : scroller.clientHeight)
          : 1;
      const current = currentPosition();
      if (!frame) target = current;
      const nextTarget = Math.max(0, Math.min(maximumPosition(), target + event.deltaY * unit));
      if (nextTarget === current && nextTarget === target) return;

      event.preventDefault();
      target = nextTarget;
      if (!frame) {
        motionElement.classList.add("is-smooth-wheel-scrolling");
        frame = requestAnimationFrame(animate);
      }
    }, { passive: false });

    scroller.addEventListener("pointerdown", stop, { passive: true });
    window.addEventListener("keydown", (event) => {
      if (["ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp", " "].includes(event.key)) stop();
    });
    reducedMotion.addEventListener("change", stop);
  }

  enhance(window);
  enhance(elements.dialogScroller);
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
setupSmoothWheelScrolling();

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
  if (state.selectedPeriod === "todayTomorrow") {
    return {
      start: localToday(),
      end: tomorrowKey(),
    };
  }
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

function closeDatePickers() {
  if (!datePicker) return;
  datePicker.popover.hidden = true;
  datePicker.trigger.setAttribute("aria-expanded", "false");
  datePicker.selectionAnchor = null;
  datePicker.hoverDate = null;
}

function setupDatePickers() {
  const startInput = elements.dateStartFilter;
  const endInput = elements.dateEndFilter;
  const root = startInput.closest(".date-picker");
  const trigger = root.querySelector(".date-picker-trigger");
  const value = root.querySelector(".date-picker-value");
  const popover = root.querySelector(".date-picker-popover");
  const picker = {
    hoverDate: null,
    popover,
    root,
    selectionAnchor: null,
    trigger,
    value,
    viewDate: null,
  };
  datePicker = picker;

  const sync = () => {
    if (!startInput.value) value.textContent = "Vyber deň alebo obdobie";
    else if (!endInput.value || startInput.value === endInput.value) value.textContent = formatPickerValue(startInput.value);
    else value.textContent = `${formatPickerValue(startInput.value)} – ${formatPickerValue(endInput.value)}`;
    trigger.classList.toggle("is-filled", Boolean(startInput.value));
    trigger.setAttribute("aria-label", startInput.value
      ? `Vybrané obdobie: ${value.textContent}. Zmeniť výber`
      : "Vyber deň alebo obdobie");
  };

  const dateIsDisabled = (date) => Boolean(
    (startInput.min && date < startInput.min) || (startInput.max && date > startInput.max)
  );

  const previewBounds = () => {
    const anchor = picker.selectionAnchor;
    const edge = picker.hoverDate || anchor;
    if (!anchor) return { start: startInput.value, end: endInput.value || startInput.value };
    return anchor <= edge ? { start: anchor, end: edge } : { start: edge, end: anchor };
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
      <span class="date-picker-days"></span>
      <span class="date-picker-help">${picker.selectionAnchor
        ? "Vyber posledný deň obdobia."
        : "Klikni na prvý deň obdobia."}</span>`;

    const previous = popover.querySelector('[data-month-step="-1"]');
    const next = popover.querySelector('[data-month-step="1"]');
    previous.disabled = Boolean(startInput.min && monthStart <= startInput.min);
    next.disabled = Boolean(startInput.max && monthEnd >= startInput.max);
    const days = popover.querySelector(".date-picker-days");
    const selected = previewBounds();

    for (let index = 0; index < 42; index += 1) {
      const cellDate = new Date(firstCell);
      cellDate.setDate(firstCell.getDate() + index);
      const date = isoDate(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());
      const button = document.createElement("button");
      button.className = "date-picker-day";
      button.type = "button";
      button.textContent = String(cellDate.getDate());
      button.dataset.date = date;
      button.disabled = dateIsDisabled(date);
      button.classList.toggle("is-outside", cellDate.getMonth() !== month);
      button.classList.toggle("is-today", date === localToday());
      button.classList.toggle("is-in-range", Boolean(selected.start && date >= selected.start && date <= selected.end));
      button.classList.toggle("is-range-start", date === selected.start);
      button.classList.toggle("is-range-end", date === selected.end);
      button.setAttribute("aria-label", formatDay(date, "long"));
      button.setAttribute("aria-pressed", String(Boolean(selected.start && date >= selected.start && date <= selected.end)));
      days.append(button);
    }
  };

  const commitRange = (first, second = first) => {
    const [start, end] = first <= second ? [first, second] : [second, first];
    state.selectedDateStart = start;
    state.selectedDateEnd = end;
    state.selectedPeriod = "custom";
    renderPeriods();
    renderProgram();
  };

  const chooseDate = (date) => {
    if (!picker.selectionAnchor) {
      picker.selectionAnchor = date;
      picker.hoverDate = date;
      commitRange(date);
      render();
      popover.querySelector(`[data-date="${date}"]`)?.focus();
      return;
    }
    commitRange(picker.selectionAnchor, date);
    closeDatePickers();
    trigger.focus();
  };

  const open = () => {
    closeDatePickers();
    elements.genreDropdown.open = false;
    elements.cinemaDropdown.open = false;
    elements.sortDropdown.open = false;
    const initial = startInput.value || startInput.min || localToday();
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
      chooseDate(day.dataset.date);
      return;
    }
    const navigation = event.target.closest("[data-month-step]");
    if (!navigation || navigation.disabled) return;
    const step = Number(navigation.dataset.monthStep);
    picker.viewDate = new Date(picker.viewDate.getFullYear(), picker.viewDate.getMonth() + step, 1);
    render();
    popover.querySelector(`[data-month-step="${step}"]`).focus();
  });

  popover.addEventListener("mouseover", (event) => {
    if (!picker.selectionAnchor) return;
    const day = event.target.closest("[data-date]");
    if (!day || day.disabled || picker.hoverDate === day.dataset.date) return;
    picker.hoverDate = day.dataset.date;
    render();
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

function periodLabel() {
  const { start, end } = periodBounds();
  if (state.selectedPeriod === "todayTomorrow") return "Dnes a zajtra";
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
  elements.dateEndFilter.min = elements.dateStartFilter.min;
  datePicker?.sync();
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
  elements.genreMatchAll.checked = state.genreMatchMode === "all";
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

function updateSortSelection() {
  const selectedOption = [...elements.sortFilter.options]
    .find((option) => option.value === state.sortBy);
  elements.sortFilter.value = state.sortBy;
  elements.sortSummary.textContent = selectedOption?.textContent || "Zoradiť";
  for (const button of elements.sortOptions.querySelectorAll("[data-sort]")) {
    const isSelected = button.dataset.sort === state.sortBy;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-checked", String(isSelected));
  }
}

function renderSortOptions() {
  elements.sortOptions.replaceChildren(...[...elements.sortFilter.options].map((option) => {
    const button = document.createElement("button");
    button.className = "filter-option sort-option";
    button.type = "button";
    button.dataset.sort = option.value;
    button.setAttribute("role", "menuitemradio");
    button.textContent = option.textContent;
    return button;
  }));
  updateSortSelection();
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

function showtimeElement(screening, movie, cinema) {
  const detailUrl = screening.detailUrl
    || (movie.source === screening.source ? movie.detailUrl : null)
    || cinema?.url;
  const element = document.createElement(detailUrl ? "a" : "span");
  element.className = `showtime${screening.soldOut ? " is-sold-out" : ""}`;
  element.textContent = timeValue(screening.startsAt);
  element.title = screening.soldOut
    ? "Vypredané"
    : [screening.auditorium, screening.format?.join(" · ")].filter(Boolean).join(" · ")
      || (detailUrl ? "Detail filmu na stránke kina" : "Detail filmu nie je dostupný");
  if (element instanceof HTMLAnchorElement) {
    element.href = detailUrl;
    element.target = "_blank";
    element.rel = "noreferrer";
    element.setAttribute("aria-label", `${timeValue(screening.startsAt)} — detail filmu na stránke kina`);
  }
  return element;
}

function movieMeta(movie, { includeAlternativeTitle = true } = {}) {
  const alternativeTitle = alternativeMovieTitle(movie);
  const details = [
    movie.directors?.length ? movie.directors.slice(0, 2).join(", ") : null,
    movie.durationMinutes ? formatDuration(movie.durationMinutes) : null,
    movie.releaseYear || null,
  ];
  return [
    includeAlternativeTitle ? alternativeTitle : null,
    details.filter(Boolean).join(" · "),
  ].filter(Boolean).join("\n");
}

function productionCountriesElement(movie) {
  if (!movie.productionCountries?.length) return null;
  const countries = document.createElement("span");
  countries.className = "production-countries";
  countries.setAttribute("aria-label", "Krajiny výroby");
  for (const code of movie.productionCountries) {
    const flagPath = countryFlagPath(code);
    if (!flagPath) continue;
    const country = document.createElement("span");
    const name = countryName(code);
    const image = document.createElement("img");
    country.className = "production-country";
    country.title = name;
    country.setAttribute("role", "img");
    country.setAttribute("aria-label", name);
    image.src = flagPath;
    image.alt = "";
    image.width = 28;
    image.height = 21;
    image.decoding = "async";
    image.addEventListener("error", () => {
      country.textContent = countryFlag(code) || String(code).toUpperCase();
    }, { once: true });
    country.append(image);
    countries.append(country);
  }
  return countries.childElementCount ? countries : null;
}

function renderDialogMovieMeta(movie) {
  const alternativeTitle = alternativeMovieTitle(movie);
  const details = [];
  if (movie.directors?.length) {
    const directors = document.createDocumentFragment();
    directors.append("Réžia: ");
    movie.directors.forEach((name, index) => {
      const link = document.createElement("a");
      link.className = "dialog-director-link";
      link.href = directorSearchUrl(name);
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = name;
      link.setAttribute("aria-label", `${name} — vyhľadať cez Google`);
      directors.append(index ? ", " : "", link);
    });
    details.push(directors);
  }
  if (movie.durationMinutes) details.push(formatDuration(movie.durationMinutes));
  if (movie.releaseYear) details.push(String(movie.releaseYear));
  const countries = productionCountriesElement(movie);
  if (countries) details.push(countries);

  elements.dialogMeta.replaceChildren();
  if (alternativeTitle) {
    const titleRow = document.createElement("span");
    titleRow.className = "dialog-original-title";
    titleRow.textContent = alternativeTitle;
    elements.dialogMeta.append(titleRow);
  }
  if (details.length) {
    const detailsRow = document.createElement("span");
    detailsRow.className = "dialog-movie-details";
    details.forEach((item, index) => {
      if (index) detailsRow.append(" · ");
      detailsRow.append(item);
    });
    elements.dialogMeta.append(detailsRow);
  }
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
      const cinema = cinemaMap.get(cinemaId);
      times.replaceChildren(...cinemaScreenings.map((screening) => showtimeElement(screening, movie, cinema)));
      group.append(label, times);
      day.append(group);
    }
    root.append(day);
  }
}

function oscarLabel(wins) {
  return `${wins} ${wins === 1 ? "Oscar" : wins < 5 ? "Oscary" : "Oscarov"}`;
}

function renderMovieCast(movie) {
  const { cast, names } = limitedMovieCast(movie);
  elements.dialogCast.hidden = names.length === 0;
  if (names.length === 0) {
    elements.dialogCast.replaceChildren();
    return;
  }
  if (!cast.some((person) => person.profileUrl)) {
    const heading = document.createElement("p");
    heading.className = "dialog-cast-heading";
    heading.textContent = "Herci";
    const list = document.createElement("p");
    list.className = "dialog-cast-links";
    names.forEach((name, index) => {
      const link = document.createElement("a");
      link.href = actorSearchUrl(name);
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = name;
      link.setAttribute("aria-label", `${name} — vyhľadať cez Google`);
      list.append(index ? document.createTextNode(", ") : "", link);
    });
    elements.dialogCast.replaceChildren(heading, list);
    return;
  }
  const heading = document.createElement("p");
  heading.className = "dialog-cast-heading";
  heading.textContent = "Herci";
  const list = document.createElement("div");
  list.className = "dialog-cast-list";
  for (const person of cast) {
    const item = document.createElement("a");
    item.className = "dialog-cast-member";
    item.href = actorSearchUrl(person.name);
    item.target = "_blank";
    item.rel = "noreferrer";
    item.setAttribute("aria-label", `${person.name} — vyhľadať cez Google`);
    if (person.profileUrl) {
      const image = document.createElement("img");
      image.src = person.profileUrl;
      image.alt = "";
      image.width = 80;
      image.height = 80;
      image.loading = "lazy";
      image.decoding = "async";
      item.append(image);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "dialog-cast-placeholder";
      placeholder.setAttribute("aria-hidden", "true");
      placeholder.textContent = person.name.slice(0, 1).toLocaleUpperCase("sk");
      item.append(placeholder);
    }
    const label = document.createElement("span");
    label.className = "dialog-cast-label";
    const actor = document.createElement("strong");
    actor.textContent = person.name;
    label.append(actor);
    if (person.character) {
      const character = document.createElement("small");
      character.textContent = person.character;
      label.append(character);
    }
    item.append(label);
    list.append(item);
  }
  elements.dialogCast.replaceChildren(heading, list);
}

function renderMovieFacts(movie) {
  const meta = elements.dialogMetascore;
  meta.hidden = !Number.isFinite(movie.metascore);
  meta.className = `critic-score metascore is-${metascoreTone(movie.metascore)}`;
  meta.textContent = meta.hidden ? "" : movie.metascore;
  meta.href = metacriticMovieUrl(movie);
  meta.title = `Metascore: ${movie.metascore}/100 · Vážené hodnotenie filmových kritikov`;
  meta.setAttribute("aria-label", meta.title);
  const tomatoes = elements.dialogTomatoes;
  tomatoes.hidden = !Number.isFinite(movie.rottenTomatoesRating);
  const tone = tomatoTone(movie.rottenTomatoesRating);
  tomatoes.className = `critic-score tomatoes is-${tone}`;
  tomatoes.querySelector(".tomato-value").textContent = tomatoes.hidden ? "" : `${movie.rottenTomatoesRating} %`;
  tomatoes.href = rottenTomatoesMovieUrl(movie);
  tomatoes.title = `Rotten Tomatoes: ${movie.rottenTomatoesRating} % pozitívnych recenzií kritikov · ${tone === "fresh" ? "Fresh" : "Rotten"}`;
  tomatoes.setAttribute("aria-label", tomatoes.title);
  const facts = [
    { label: "Oscary", value: movie.oscarWins > 0 ? oscarLabel(movie.oscarWins) : null, style: "is-oscar" },
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
  const hasBudget = Number.isFinite(movie.budgetUsd) && movie.budgetUsd > 0;
  const hasGross = Number.isFinite(movie.worldwideGrossUsd) && movie.worldwideGrossUsd > 0;
  const budget = elements.dialogFinancials.querySelector("[data-financial='budget']");
  const gross = elements.dialogFinancials.querySelector("[data-financial='gross']");
  budget.hidden = !hasBudget;
  budget.querySelector("dd").textContent = hasBudget ? formatUsd(movie.budgetUsd) : "";
  gross.hidden = !hasGross;
  gross.querySelector("dd").textContent = hasGross ? formatUsd(movie.worldwideGrossUsd) : "";
  const grossBelowBudget = hasBudget && hasGross && movie.worldwideGrossUsd < movie.budgetUsd;
  const grossAboveBudget = hasBudget && hasGross && movie.worldwideGrossUsd > movie.budgetUsd;
  gross.classList.toggle("is-below-budget", grossBelowBudget);
  gross.classList.toggle("is-above-budget", grossAboveBudget);
  gross.title = grossBelowBudget
    ? "Celosvetové tržby neprekročili vykázaný produkčný rozpočet. Nejde o presný výpočet zisku."
    : "Celosvetové tržby podľa TMDb";
  elements.dialogFinancials.hidden = !hasBudget && !hasGross;
  elements.dialogActions.hidden = !movie.trailerUrl
    && elements.dialogRatings.childElementCount === 0
    && meta.hidden
    && tomatoes.hidden
    && facts.length === 0
    && !hasBudget
    && !hasGross;
}

function renderMovieRatings(movie, ratingsElement) {
  ratingsElement.replaceChildren();
  const ratings = [
    { source: "ČSFD", score: movie.csfdRating, max: 100, votes: movie.csfdVotes, url: movie.csfdId ? `https://www.csfd.cz/film/${movie.csfdId}/` : null },
    { source: "IMDb", score: movie.imdbRating, max: 10, votes: movie.imdbVotes, url: movie.imdbId ? `https://www.imdb.com/title/${movie.imdbId}/` : null },
  ];
  for (const rating of ratings) {
    if (!rating.url) continue;
    const hasRating = Number.isFinite(rating.score);
    const score = hasRating ? (rating.max === 10 ? rating.score.toFixed(1) : Math.round(rating.score).toLocaleString("sk-SK")) : null;
    const ratingElement = document.createElement("a");
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
    ratingElement.href = rating.url;
    ratingElement.target = "_blank";
    ratingElement.rel = "noreferrer";
    ratingsElement.append(ratingElement);
  }
}

function clearDialogBackdrop() {
  dialogBackdropLoadId += 1;
  elements.dialog.classList.remove("has-backdrop");
  elements.dialog.style.removeProperty("--dialog-backdrop-image");
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
    elements.dialog.style.setProperty("--dialog-backdrop-image", `url("${url}")`);
    elements.dialogBackdrop.classList.add("is-loaded");
  };
  const discard = () => {
    if (loadId === dialogBackdropLoadId) clearDialogBackdrop();
  };

  elements.dialog.classList.add("has-backdrop");
  elements.dialogBackdrop.hidden = false;
  elements.dialogBackdrop.fetchPriority = "high";
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
    const url = movieDetailUrl(movie.id, window.location.href);
    if (url !== window.location.href) window.history.pushState(null, "", url);
  }
  loadDialogBackdrop(movie.backdropUrl);
  elements.dialogKicker.textContent = movie.genres?.slice(0, 2).join(" · ") || "Film";
  elements.dialogTitle.textContent = movie.title;
  renderDialogMovieMeta(movie);
  renderMovieRatings(movie, elements.dialogRatings);
  renderMovieFacts(movie);
  renderMovieCast(movie);
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
  const url = new URL(window.location.href);
  const hasMoviePath = /^\/film\/[^/]+\/?$/u.test(url.pathname);
  const hasLegacyHash = url.hash.startsWith("#film=");
  if (!hasMoviePath && !hasLegacyHash) return;
  if (hasMoviePath) url.pathname = "/";
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
  const pathMatch = window.location.pathname.match(/^\/film\/([^/]+)\/?$/u);
  const legacyParams = new URLSearchParams(window.location.hash.slice(1));
  let movieId = legacyParams.get("film");
  if (pathMatch) {
    try {
      movieId = decodeURIComponent(pathMatch[1]);
    } catch {
      movieId = null;
    }
  }
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
  const favoriteButton = fragment.querySelector(".favorite-button");
  oscarBadge.hidden = !(movie.oscarWins > 0);
  if (movie.oscarWins > 0) {
    const label = `Získané ocenenia: ${oscarLabel(movie.oscarWins)}`;
    oscarBadge.title = label;
    oscarBadge.setAttribute("aria-label", label);
    oscarBadge.querySelector("span").textContent = movie.oscarWins;
  }

  fragment.querySelector("h3").textContent = movie.title;
  fragment.querySelector(".movie-kicker").textContent = movie.genres?.slice(0, 2).join(" · ") || "Film";
  const meta = fragment.querySelector(".movie-meta");
  const alternativeTitle = alternativeMovieTitle(movie);
  if (alternativeTitle) {
    const titleRow = document.createElement("span");
    titleRow.className = "movie-original-title";
    titleRow.textContent = alternativeTitle;
    meta.append(titleRow);
  }
  const details = movieMeta(movie, { includeAlternativeTitle: false });
  const countries = productionCountriesElement(movie);
  if (details || countries) {
    const detailsRow = document.createElement("span");
    detailsRow.className = "movie-details";
    if (details) detailsRow.append(details);
    if (countries) detailsRow.append(details ? " · " : "", countries);
    meta.append(detailsRow);
  }
  const nearestScreening = [...screenings].sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const countLabel = `${screenings.length} ${screenings.length === 1 ? "predstavenie" : screenings.length < 5 ? "predstavenia" : "predstavení"}`;
  screeningCount.textContent = `${countLabel} · ${nearestScreeningLabel(nearestScreening, cinemaMap)}`;

  if (movie.posterUrl) {
    poster.src = movie.posterUrl;
    poster.alt = `Plagát filmu ${movie.title}`;
    poster.addEventListener("error", () => poster.classList.add("is-broken"));
  }
  card.dataset.movieId = movie.id;
  updateFavoriteButton(favoriteButton, movie);
  favoriteButton.addEventListener("click", () => toggleFavorite(movie, favoriteButton));
  renderMovieRatings(movie, ratingsElement);
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `${movie.title} — zobraziť termíny premietania`);
  card.addEventListener("pointerenter", () => preloadDialogBackdrop(movie.backdropUrl), { once: true });
  card.addEventListener("focus", () => preloadDialogBackdrop(movie.backdropUrl), { once: true });
  card.addEventListener("click", (event) => {
    if (event.target.closest("a, button")) return;
    openMovieDialog(movie, screenings, cinemaMap);
  });
  card.addEventListener("auxclick", (event) => {
    if (event.button !== 1 || event.target.closest("a, button")) return;
    event.preventDefault();
    window.open(movieDetailUrl(movie.id, window.location.href), "_blank", "noopener");
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
    .filter((movie) => state.selectedGenres.size === availableGenres().length
      || matchesSelectedGenres(movie.genres, state.selectedGenres, state.genreMatchMode))
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
      && (!state.showFavoritesOnly || state.favoriteMovieIds.has(screening.movieId))
      && (state.sortBy !== "czSk" || czSkMovieIds.has(screening.movieId))
      && (state.sortBy !== "nonEnglish" || isNonEnglishMovie(movie, screening))
      && (state.sortBy !== "cult" || (Number.isFinite(releaseYear) && releaseYear <= CULT_MOVIE_LATEST_YEAR))
      && (state.sortBy !== "added" || (Number.isFinite(firstSeenAt) && firstSeenAt >= recentlyAddedSince))
      && (state.sortBy !== "mustWatch" || isMustWatch(movie))
      && (state.sortBy !== "oscars" || isOscarWinner(movie));
  });
  const grouped = groupScreenings(visible);
  elements.selectedPeriodLabel.textContent = periodLabel();
  elements.resultCount.textContent = `${grouped.size} ${grouped.size === 1 ? "film" : grouped.size < 5 ? "filmy" : "filmov"} · ${visible.length} predstavení`;

  if (visible.length === 0) {
    const emptyTitle = state.showFavoritesOnly && state.favoriteMovieIds.size === 0
      ? "Zatiaľ tu nemáš žiadny obľúbený film"
      : "Tomuto výberu nič nezodpovedá";
    const emptyCopy = state.showFavoritesOnly && state.favoriteMovieIds.size === 0
      ? "Klikni na srdiečko pri filme a nájdeš ho potom práve tu."
      : "Skús dlhšie obdobie, iný žáner alebo zapni ďalšie kino.";
    elements.movieGrid.innerHTML = `
      <div class="empty-state">
        <div><h3>${emptyTitle}</h3><p>${emptyCopy}</p></div>
      </div>`;
    return;
  }

  const cards = [...grouped.entries()]
    .map(([movieId, screenings]) => ({ movie: movieMap.get(movieId), screenings }))
    .filter(({ movie }) => movie)
    .sort((a, b) => {
      if (["rating", "cult", "mustWatch", "czSk", "nonEnglish", "oscars"].includes(state.sortBy)) {
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
  } else if (ageHours > 24) {
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
          period: { type: "string", enum: ["all", "todayTomorrow", "custom"], description: "Celý program, dnešok so zajtrajškom alebo vlastné obdobie." },
          startDate: { type: "string", description: "Začiatok rozsahu vo formáte RRRR-MM-DD." },
          endDate: { type: "string", description: "Koniec rozsahu vo formáte RRRR-MM-DD." },
          cinemaIds: {
            type: "array",
            items: { type: "string", enum: [...availableCinemas] },
            description: "ID kín, ktoré majú zostať viditeľné."
          },
          genre: { type: "string", enum: ["all", ...availableGenres], description: "Vybraný žáner alebo all." },
          genres: { type: "array", items: { type: "string", enum: [...availableGenres] }, description: "Vybrané žánre; prázdny zoznam zobrazí všetky. Má prednosť pred genre." },
          genreMatch: { type: "string", enum: ["any", "all"], description: "any vyžaduje aspoň jeden vybraný žáner, all všetky vybrané žánre." },
          sortBy: { type: "string", enum: ["rating", "mustWatch", "oscars", "czSk", "nonEnglish", "shortest", "longest", "cult", "added", "soonest"], description: "rating zoradí podľa hodnotenia zo zdroja s väčším počtom hlasov; mustWatch zobrazí iba filmy s IMDb hodnotením aspoň 8; oscars zobrazí iba víťazov Oscara zoradených podľa hodnotenia; czSk zobrazí české, slovenské a československé filmy; nonEnglish zobrazí filmy, ktorých pôvodný jazyk nie je angličtina; shortest a longest zoradia podľa dĺžky; cult zobrazí filmy do roku 2024 a added filmy prvýkrát zachytené za posledných 7 dní." }
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
        } else if (input.period === "todayTomorrow") {
          state.selectedPeriod = "todayTomorrow";
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
        if (input.genreMatch) state.genreMatchMode = input.genreMatch;
        if (input.sortBy) state.sortBy = input.sortBy;
        updateGenreSelection();
        updateSortSelection();
        renderPeriods();
        renderCinemas();
        renderProgram();
        return {
          period: state.selectedPeriod,
          startDate: state.selectedDateStart || null,
          endDate: state.selectedDateEnd || null,
          cinemaIds: [...state.selectedCinemas],
          genres: [...state.selectedGenres],
          genreMatch: state.genreMatchMode,
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
    renderSortOptions();
    updateFavoritesFilter();
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
  if (!elements.sortDropdown.contains(event.target)) elements.sortDropdown.open = false;
  const clickedDatePicker = datePicker && event.composedPath().includes(datePicker.root);
  if (!clickedDatePicker) closeDatePickers();
});

for (const dropdown of [elements.cinemaDropdown, elements.genreDropdown, elements.sortDropdown]) {
  dropdown.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    dropdown.open = false;
    dropdown.querySelector("summary").focus();
  });
}

elements.sortOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-sort]");
  if (!button) return;
  state.sortBy = button.dataset.sort;
  updateSortSelection();
  elements.sortDropdown.open = false;
  renderProgram();
});

elements.genreMatchAll.addEventListener("change", () => {
  state.genreMatchMode = elements.genreMatchAll.checked ? "all" : "any";
  renderProgram();
});

elements.favoritesFilterButton.addEventListener("click", () => {
  state.showFavoritesOnly = !state.showFavoritesOnly;
  updateFavoritesFilter();
  renderProgram();
});

elements.resetFiltersButton.addEventListener("click", () => {
  state.selectedPeriod = "all";
  state.selectedDateStart = "";
  state.selectedDateEnd = "";
  state.selectedGenres = new Set(availableGenres());
  state.genreMatchMode = "any";
  state.showFavoritesOnly = false;
  state.sortBy = "rating";
  state.selectedCinemas = new Set(state.program.cinemas.map((cinema) => cinema.id));
  updateGenreSelection();
  updateSortSelection();
  updateFavoritesFilter();
  renderPeriods();
  renderCinemas();
  renderProgram();
});

elements.themeToggle.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
});

function openInstallDialog() {
  const platform = /Android/u.test(navigator.userAgent) ? "android" : "ios";
  selectInstallPlatform(platform);
  if (typeof elements.installDialog.showModal === "function") elements.installDialog.showModal();
  else elements.installDialog.setAttribute("open", "");
  document.body.classList.add("has-open-dialog");
}

function selectInstallPlatform(platform, focus = false) {
  for (const tab of elements.installPlatformTabs) {
    const selected = tab.dataset.installPlatform === platform;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  for (const panel of elements.installPlatformPanels) {
    panel.hidden = panel.dataset.installPanel !== platform;
  }
}

function closeInstallDialog() {
  if (typeof elements.installDialog.close === "function") elements.installDialog.close();
  else elements.installDialog.removeAttribute("open");
  document.body.classList.remove("has-open-dialog");
}

elements.installToggle.addEventListener("click", openInstallDialog);
elements.installPlatformTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectInstallPlatform(tab.dataset.installPlatform));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const lastIndex = elements.installPlatformTabs.length - 1;
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? lastIndex
        : event.key === "ArrowRight" ? (index + 1) % elements.installPlatformTabs.length
          : (index - 1 + elements.installPlatformTabs.length) % elements.installPlatformTabs.length;
    selectInstallPlatform(elements.installPlatformTabs[nextIndex].dataset.installPlatform, true);
  });
});
elements.installDialogClose.addEventListener("click", closeInstallDialog);
elements.installDialog.addEventListener("click", (event) => {
  if (event.target === elements.installDialog) closeInstallDialog();
});
elements.installDialog.addEventListener("close", () => {
  if (!elements.installDialog.hasAttribute("open")) document.body.classList.remove("has-open-dialog");
});
elements.installDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeInstallDialog();
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
