# Test scrollovania detailu filmu

Overené 11. 9. 2026 v headless Chrome na Windows, pri rozmeroch okna
1280 × 800 a 390 × 844. Mobilný rozmer je simulovaný viewport, nie fyzický telefón.

## Porovnávacie režimy

Spusti `npm run serve` a otvor ten istý film s týmito parametrami:

| Režim | Príklad cesty |
| --- | --- |
| Opravený scroll, všetky dáta naraz | `/film/movie-tony?dialogData=eager` |
| Opravený scroll, lazy dáta (predvolené) | `/film/movie-tony` |
| Lazy dáta, bez vizuálnych efektov | `/film/movie-tony?dialogVisuals=plain` |

Parametre možno kombinovať. Režim `plain` zachováva boxy obrázkov, text,
medzery a výšku obsahu. V dialógu vypína vykresľovanie obrázkov a SVG,
gradienty, filtre, blur, tiene a prechody. Pozadie filmu a fotografie hercov
sa v tomto režime nesťahujú. Bežný vzhľad zostáva predvolený.

## Výsledky

Pôvodná verzia rušila natívny wheel event a animovala `scrollTop` v JavaScripte.
Opravená verzia necháva scroll prehliadaču, počas otvoreného dialógu odpája
aj blokujúci wheel listener okna. Scrollbar pri posune aktualizuje iba transform;
rozmery prepočítava pri otvorení a zmene veľkosti obsahu.

Orientačný 95. percentil intervalov `requestAnimationFrame` počas desiatich
wheel vstupov po 160 px (jedno meranie každého režimu):

| Dáta / viewport | Pôvodné | Opravené + eager | Lazy | Lazy + plain |
| --- | ---: | ---: | ---: | ---: |
| Tony, desktop | 50,3 ms | 16,9 ms | 16,9 ms | 16,9 ms |
| Tony, mobilná šírka | 33,4 ms | 16,8 ms | 16,8 ms | 16,8 ms |
| Testovacia vzorka s obrázkami, desktop | 133,2 ms | 33,3 ms | 16,8 ms | 16,9 ms |
| Testovacia vzorka s obrázkami, mobilná šírka | 50,1 ms | 16,8 ms | 16,8 ms | 16,9 ms |

Tieto krátke headless merania ukazujú zlepšenie po odstránení vlastnej animácie;
nie sú meraním latencie vstupu ani dôkazom samostatného prínosu lazy dát či
odstránenia efektov. Výsledok závisí od GPU, displeja a zaťaženia počítača.

Aktuálny program nemal film s fotografiami obsadenia, preto druhá vzorka
doplnila iba v testovacích HTTP odpovediach šesť fiktívnych členov obsadenia
s lokálnym obrázkom loga, lokálne hero pozadie, trailer a finančné údaje.
Uložený program sa nemenil. Výška obsahu bola identická vo všetkých režimoch:
Tony 1621 / 2273 px, vzorka s obrázkami 1851 / 2621 px (desktop / mobilná šírka).
Zhodovala sa aj výška hero sekcie a obsadenia; nevznikol horizontálny overflow.

Prešli wheel, Home/End, ťahanie thumbu, Escape, uzamknutie scrollu stránky,
otvorenie cez priamy odkaz, chyba HTTP 503 a retry, zatvorenie počas načítania
a prepnutie filmu pred dokončením staršej odpovede. Bez runtime výnimiek
v porovnávaných režimoch.

Pred prvým otvorením: žiadny request na detail. Prvé otvorenie: jeden request.
Opakované otvorenie: cache bez ďalšieho requestu. Minifikovaný úvodný JSON
sa zmenšil z 215755 na 199856 bajtov (7,4 %, pred kompresiou).

`npm test`: 138/138. `npm run check`, `npm run build` a `git diff --check`: prešli.
Lokálne skripty, JSON merania a screenshoty z tohto behu sú v ignorovanom
priečinku `.cache/dialog-scroll/` (`compare.cjs`, `fixture.cjs`, `results.json`,
`fixture-results.json`, `lazy-*.png`, `plain-*.png`, `fixture-*.png`).

## Dáta pri zostavení

`npm run build` ponecháva úplný `program.json` pre sociálne náhľady a vytvára
`program-index.json` a `movie-details/<sha256>.json`. Lokálny server poskytuje
rovnaké payloady z aktuálneho `site/program.json`. Obsahový hash zmení URL pri
zmene detailu. Neúspešné requesty sa z cache odstránia, aby fungovalo opakovanie.
Existujúce `detailUrl` odkazy do kín zostávajú zachované; lazy dáta používajú
samostatné pole `detailDataUrl`.
