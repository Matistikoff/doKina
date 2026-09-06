# doKina.sk

Jednoduchý prehľad filmových predstavení v bratislavských kinách. Spája program Kina Lumière, Kina Film Europe, Kina Mladosť, Kina Lúky, Kina Nostalgia, Edison Filmhub Bratislava, Novej Cvernovky a Kina inak v A4 do jedného normalizovaného súboru `program.json`.

Frontend je čisté HTML, CSS a JavaScript. Node.js sa používa iba na získanie dát, testy a lokálny server.

## Zdroje dát

- **Kino Lumière:** slovenský a anglický HTML program; zhodujú sa podľa stabilného ID filmu, aby sa anglický názov dal použiť na vyhľadanie IMDb.
- **Kino Film Europe a Kino Nostalgia:** štruktúrované dáta programu vložené vo verejných stránkach kín.
- **Kino Mladosť:** HTML programová tabuľka systému Cinemaware.
- **Kino Lúky:** verejný zoznam filmových podujatí Kultúrnych zariadení Petržalky.
- **Edison Filmhub Bratislava:** slovenský HTML program a oficiálna anglická lokalizácia, z ktorej sa dopĺňajú anglické názvy; filmové metadáta sa čítajú zo schema.org dát na detailoch filmov.
- **Nová Cvernovka:** verejný zoznam podujatí filtrovaný na filmy a ich detailové stránky; anglický názov sa doplní, keď ho oficiálna anglická lokalizácia naozaj poskytuje.
- **A4 – Kino inak:** slovenský program a detaily podujatí; anglické názvy sa párujú s oficiálnou anglickou lokalizáciou pomocou spoločného odkazu na vstupenky a termínu projekcie.

Scraper pristupuje iba k verejným programovým stránkam, používa časové limity a obmedzený počet opakovaní. Zlyhanie jedného zdroja sa zaznamená do `program.json` a neblokuje aktualizáciu ostatných kín; ak zlyhajú všetky zdroje, starý program zostane zachovaný.

## Lokálne spustenie

Vyžaduje Node.js 22 alebo novší.

```bash
npm install
npm test
npm run scrape
npm run serve
```

Web bude dostupný na `http://127.0.0.1:4173`.

## Príkazy

- `npm run scrape` — načíta programy a prepíše `site/program.json`.
- `npm test` — spustí parser testy nad lokálnymi fixtures bez siete.
- `npm run check` — skontroluje syntax hlavných JavaScript súborov.
- `npm run build` — overí dáta a pripraví priečinok `dist/`.
- `npm run deploy` — nasadí pripravený web cez Wrangler.

## Automatické obnovenie

Workflow `.github/workflows/refresh-and-deploy.yml` beží po každom pushi do vetvy `main`, raz denne o 04:17 UTC a dá sa spustiť aj ručne. Najskôr vykoná testy, potom získanie programu, zostavenie a nasadenie.

V GitHub repozitári treba nastaviť Actions secret `DOKINACLOUDFLARE`
s API tokenom pre nasadenie. Cloudflare account ID je nesenzitívna hodnota
uvedená priamo vo workflow.

Voliteľné IMDb hodnotenia sa získavajú cez OMDb a ukladajú do cache. Na ich
zapnutie pridaj GitHub Actions secret `OMDB_API_KEY`. Bez neho scraper aj web
fungujú ďalej a zachovajú dostupné hodnotenia z predchádzajúceho programu
alebo lokálnej cache; nové hodnotenia bez kľúča nezískajú. Pri lokálnom spustení
scraper načíta kľúč aj zo súboru `.env` v koreňovom priečinku projektu
(`OMDB_API_KEY=...`), ktorý je vylúčený z Gitu. Bezplatný OMDb kľúč má denný limit
1 000 požiadaviek a jeho obsah je dostupný pod licenciou CC BY-NC 4.0.
Kino Mladosť sa dopĺňa z detailu filmu.
Ak zdroj originálny názov neposkytne, presná zhoda slovenského alebo českého
názvu a roku sa cez Wikidata prevedie na IMDb ID.
Pri Lumière sa najskôr skúsi anglický názov z oficiálnej anglickej verzie programu;
slovenský názov zostáva zobrazený na karte filmu.

Pre spoľahlivejšie párovanie lokalizovaných názvov pridaj aj `TMDB_API_KEY`
do lokálneho `.env` a GitHub Actions secrets. Ide o API kľúč (v3) z
[nastavení TMDB](https://www.themoviedb.org/settings/api), nie prihlasovacie heslo.
Kľúče zostávajú iba v scrapere; do statického webu sa nezapisujú.
TMDB sa používa na vyhľadanie IMDb ID a doplnenie metadát podľa pôvodných,
slovenských a alternatívnych názvov. Overuje sa názov, dostupný rok (±1 rok),
réžia a dĺžka; viacero zhodných filmov sa automaticky nepáruje.
Hodnotenie naďalej pochádza z OMDb. Existujúce hodnotenia sa pri výpadku zachovajú.
Po zapnutí TMDB alebo doplnení metadát sa staré neúspešné vyhľadávania zopakujú
bez čakania na sedemdňovú cache. Staré IMDb ID bez hodnotenia sa znovu preveria.
Bez TMDB kľúča zostáva dostupné vyhľadávanie cez OMDb a Wikidata.
OMDb dopĺňa aj chýbajúcu réžiu, anglický názov, rok, dĺžku a krátky anglický
popis. TMDB pridáva pôvodný názov, réžiu, rok, dĺžku a popis s prednosťou
slovenčiny, potom češtiny a angličtiny. Metadáta z TMDB sa získajú aj bez OMDb
kľúča alebo pri výpadku OMDb. Existujúce údaje kina sa neprepisujú a stará
cache iba s hodnoteniami sa automaticky doplní pri najbližšom obnovení.
Detail filmu zobrazuje sekciu „O filme“ nad termínmi; ak popis chýba, sekcia
sa nezobrazuje. Český a anglický popis majú označený jazyk.
Potvrdené výnimky pri chýbajúcich metadátach sú v `scraper/movie-identities.mjs`:
Nenávisť z Nostalgie (záznam 11420) je La Haine (1995). Výnimky sa viažu
na konkrétny zdroj a externé ID; neprepisujú konfliktné metadáta ani ID predstavení.
TMDB je bezplatné pre nekomerčné použitie s požadovaným označením zdroja;
pätička obsahuje oficiálne logo z ich stránky Logos & Attribution a predpísané upozornenie.

Token potrebuje oprávnenie nasadiť Cloudflare Worker. Projekt sa nasadzuje ako Cloudflare Worker so statickými assets z priečinka `dist/`.

## Štruktúra dát

`site/program.json` obsahuje čas vytvorenia, stav zdrojov, kiná, filmy a predstavenia. Časy sú uložené ako ISO 8601 s bratislavským UTC offsetom. Identifikátory predstavení sú odvodené zo zdrojových ID, aby boli stabilné medzi obnoveniami.

Pri zostavení programu sa filmy spájajú podľa normalizovaných slovenských,
originálnych a anglických názvov; po doplnení hodnotení aj podľa IMDb ID.
Normalizácia ignoruje veľkosť písmen, diakritiku, interpunkciu a známe prípony
predstavení. Preklep v jednom písmene pri názve s aspoň šiestimi znakmi sa
akceptuje iba pri rovnakom roku a zhodnej réžii alebo dĺžke (rozdiel do 2 minút).
Rozporné IMDb ID, roky, režiséri alebo dĺžky s rozdielom nad 5 minút spájanie
zablokujú. Nejednoznačné zhody zostávajú oddelené. Najúplnejší záznam dodá
názov a ID, ostatné doplnia chýbajúce údaje a žánre. Všetky predstavenia,
ich pôvodné ID a odkazy na vstupenky zostávajú zachované.

## Údržba parserov

Ak zdroj zmení formát, najprv ulož anonymizovanú reprezentatívnu odpoveď do `tests/fixtures/`, uprav čistú parser funkciu a až potom aktualizuj sieťovú časť. Testy zámerne nepoužívajú živé weby, aby boli spoľahlivé.
