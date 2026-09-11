import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("iOS and Android home-screen guides open from the header in a compact dialog", async () => {
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../site/styles.css", import.meta.url), "utf8");

  assert.match(html, /id="install-toggle"[\s\S]*?aria-controls="install-dialog"/u);
  assert.match(html, /Pridaj si nás na plochu smartfónu/u);
  assert.match(html, /class="movie-dialog install-dialog"[\s\S]*?Pridaj si nás na plochu smartfónu/u);
  assert.match(html, /role="tablist"[\s\S]*?data-install-platform="ios">iOS<\/button>[\s\S]*?data-install-platform="android"/u);
  assert.match(html, /Otvor doKina\.sk v Safari[\s\S]*?Klikni na Zdieľať[\s\S]*?Vyber Pridať na plochu/u);
  assert.match(html, /class="install-mockup"[\s\S]*?src="\/iphone-home-screen-guide\.png"[\s\S]*?šípkou smerujúcou na ikonu doKina\.sk/u);
  assert.match(html, /Otvor doKina\.sk v Chrome[\s\S]*?Otvor menu[\s\S]*?Vytvor odkaz/u);
  assert.match(html, /id="install-panel-ios"[\s\S]*?<rect x="5" y="5" width="22" height="22"[\s\S]*?Vyber Pridať na plochu/u);
  assert.match(html, /id="install-panel-android"[\s\S]*?<rect x="5" y="5" width="22" height="17"[\s\S]*?M16 9v8[\s\S]*?Vytvor odkaz/u);
  assert.match(html, /src="\/android-home-screen-guide\.png"[\s\S]*?Android telefónu so šípkou/u);
  assert.match(app, /elements\.installToggle\.addEventListener\("click", openInstallDialog\)/u);
  assert.match(app, /\/Android\/u\.test\(navigator\.userAgent\)[\s\S]*?selectInstallPlatform\(platform\)/u);
  assert.match(app, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/u);
  assert.match(app, /elements\.installDialog\.addEventListener\("cancel"[\s\S]*?closeInstallDialog\(\)/u);
  assert.match(styles, /\.install-mockup img \{[\s\S]*?left: -40\.14%;[\s\S]*?\[data-install-panel="ios"\] \.install-mockup img \{[\s\S]*?left: -50\.28%;/u);
  assert.match(styles, /@media \(max-width: 620px\) \{[\s\S]*?\.site-header \{[\s\S]*?flex-direction: column;[\s\S]*?\.brand \{[\s\S]*?position: static;[\s\S]*?align-self: flex-end;[\s\S]*?width: min\(210px, calc\(100vw - 24px\)\);/u);
  assert.match(styles, /@media \(max-width: 620px\) \{[\s\S]*?\.header-actions \{[\s\S]*?grid-template-columns: repeat\(2, 44px\);[\s\S]*?justify-content: end;[\s\S]*?\.install-toggle \{[\s\S]*?grid-row: 1;[\s\S]*?justify-self: end;[\s\S]*?width: min\(210px, calc\(100vw - 24px\)\);[\s\S]*?\.theme-toggle \{[\s\S]*?grid-row: 2;[\s\S]*?\.letterboxd-toggle \{[\s\S]*?grid-row: 2;/u);
  assert.match(styles, /@media \(max-width: 620px\) \{[\s\S]*?\.install-platform-panel \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?grid-template-rows: auto auto auto;/u);
  assert.match(styles, /@media \(max-width: 620px\) \{[\s\S]*?\.install-steps \{[\s\S]*?grid-auto-rows: 1fr;[\s\S]*?\.install-steps li \{[\s\S]*?height: 100%;/u);
  assert.doesNotMatch(styles, /install-toggle-pulse/u);
});
