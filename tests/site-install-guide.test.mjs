import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("iPhone and Android home-screen guides open from the header in a movie-sized dialog", async () => {
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../site/styles.css", import.meta.url), "utf8");

  assert.match(html, /id="install-toggle"[\s\S]*?aria-controls="install-dialog"/u);
  assert.match(html, /Pridaj si nás na plochu smartfónu/u);
  assert.match(html, /class="movie-dialog install-dialog"[\s\S]*?Pridaj si nás na plochu telefónu/u);
  assert.match(html, /role="tablist"[\s\S]*?data-install-platform="ios">iOS<\/button>[\s\S]*?data-install-platform="android"/u);
  assert.match(html, /Otvor doKina\.sk v Safari[\s\S]*?Klepni na Zdieľať[\s\S]*?Vyber Pridať na plochu/u);
  assert.match(html, /class="install-mockup"[\s\S]*?src="\/iphone-home-screen-guide\.png"[\s\S]*?šípkou smerujúcou na ikonu doKina\.sk/u);
  assert.match(html, /Otvor doKina\.sk v Chrome[\s\S]*?Otvor menu ⋮[\s\S]*?Vytvor odkaz/u);
  assert.match(html, /src="\/android-home-screen-guide\.png"[\s\S]*?Android telefónu so šípkou/u);
  assert.match(app, /elements\.installToggle\.addEventListener\("click", openInstallDialog\)/u);
  assert.match(app, /\/Android\/u\.test\(navigator\.userAgent\)[\s\S]*?selectInstallPlatform\(platform\)/u);
  assert.match(app, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/u);
  assert.match(app, /elements\.installDialog\.addEventListener\("cancel"[\s\S]*?closeInstallDialog\(\)/u);
  assert.match(styles, /\.install-steps \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/u);
  assert.match(styles, /\.install-step-number \{[\s\S]*?font-size: 1\.05rem;[\s\S]*?font-weight: 600;/u);
});
