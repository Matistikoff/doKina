import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("movie detail formats TMDB budget and worldwide gross", async () => {
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../site/styles.css", import.meta.url), "utf8");
  const financials = html.match(/<dl id="movie-dialog-financials"[^>]*>[\s\S]*?<\/dl>/u)?.[0];

  assert.ok(financials, "movie financials should exist");
  assert.match(financials, /data-financial="budget"[\s\S]*?<dt>Rozpočet<\/dt>/u);
  assert.match(financials, /data-financial="gross"[\s\S]*?<dt>Tržby<\/dt>/u);
  assert.match(source, /formatUsd\(movie\.budgetUsd\)/u);
  assert.match(source, /formatUsd\(movie\.worldwideGrossUsd\)/u);
  assert.match(source, /movie\.worldwideGrossUsd < movie\.budgetUsd/u);
  assert.match(source, /classList\.toggle\("is-below-budget", grossBelowBudget\)/u);
  assert.match(styles, /\.dialog-financial \{[\s\S]*?align-items: center;/u);
  assert.match(styles, /\.movie-dialog\.has-backdrop \.dialog-financial dt \{\s*color: white;/u);
  assert.match(styles, /\.movie-dialog\.has-backdrop \.dialog-financial dd \{[\s\S]*?color: white;/u);
  assert.match(styles, /\.movie-dialog\.has-backdrop \.dialog-financial\.is-below-budget dd \{\s*color: white;/u);
  assert.doesNotMatch(source, /movie\.boxOfficeUsd/u);
});
