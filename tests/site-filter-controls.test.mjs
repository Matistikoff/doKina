import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("discovery and period filters use the requested labels and order", async () => {
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../site/app.js", import.meta.url), "utf8");

  assert.match(html, /data-period="all"[\s\S]*?Celý program[\s\S]*?data-period="todayTomorrow"[\s\S]*?Dnes a zajtra/u);
  assert.match(html, /Najlepšie hodnotené[\s\S]*?Musíš vidieť[\s\S]*?Oscarové[\s\S]*?Kultofky[\s\S]*?CZ\/SK[\s\S]*?Neanglické/u);
  assert.match(html, /id="sort-dropdown"[\s\S]*?id="sort-options"[\s\S]*?role="menu"/u);
  assert.match(app, /createElement\("button"\)[\s\S]*?button\.dataset\.sort = option\.value/u);
  assert.doesNotMatch(app, /radio\.type = "radio"/u);
  assert.doesNotMatch(html, /Must watch|Neanglické filmy|Oscarové filmy|CZ\/SK filmy|Najkratšie filmy|Najdlhšie filmy/u);
  assert.match(app, /state\.selectedPeriod === "todayTomorrow"[\s\S]*?start: localToday\(\)[\s\S]*?end: tomorrowKey\(\)/u);
});

test("one date picker previews a range between two clicks", async () => {
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../site/app.js", import.meta.url), "utf8");

  assert.equal(html.match(/class="date-picker-trigger"/gu)?.length, 1);
  assert.match(html, /class="date-picker date-range-picker"[\s\S]*?id="date-start-filter"[\s\S]*?id="date-end-filter"/u);
  assert.match(app, /addEventListener\("mouseover"[\s\S]*?picker\.hoverDate = day\.dataset\.date[\s\S]*?render\(\)/u);
  assert.doesNotMatch(app, /picker\.(?:dragAnchor|dragDate|dragMoved|suppressClick)/u);
  assert.match(app, /classList\.toggle\("is-in-range"/u);
  assert.match(app, /state\.selectedDateStart = start;[\s\S]*?state\.selectedDateEnd = end;[\s\S]*?renderPeriods\(\);/u);
  assert.doesNotMatch(app, /startInput\.dispatchEvent\(new Event\("change"/u);
  assert.match(app, /event\.composedPath\(\)\.includes\(datePicker\.root\)/u);
});
