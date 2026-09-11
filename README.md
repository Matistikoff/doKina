# doKina.sk

Jednoduchý prehľad filmových predstavení v bratislavských kinách. Spája program Kina Lumière, Kina Film Europe, Kina Mladosť, Kina Lúky, Kina Nostalgia, Edison Filmhub Bratislava, Novej Cvernovky a Kina inak v A4 do jedného normalizovaného súboru `program.json`.

Frontend je čisté HTML, CSS a JavaScript. Node.js sa používa iba na získanie dát, testy a lokálny server.

## Zdroje dát

- **Kino Lumière:** slovenský a anglický HTML program; zhodujú sa podľa stabilného ID filmu, aby sa anglický názov dal použiť na vyhľadanie IMDb.
- **Kino Film Europe a Kino Nostalgia:** verejné GraphQL API predaja vstupeniek Entradio (`shop.entradio.sk/api/graphql`) s anonymnou návštevníckou reláciou; bez API kľúča. Program sa načítava po stránkach a filtruje podľa kina. Priame stránky kín môžu vracať Vercel Security Checkpoint (HTTP 429), ktorý bežné opakovanie požiadavky ani curl nevyrieši.
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
- `npm run audit:duplicates` — vypíše podozrivé dvojice filmov a dôvody zlúčenia alebo ponechania na kontrolu; dáta nemení.
- `npm test` — spustí parser testy nad lokálnymi fixtures bez siete.
- `npm run check` — skontroluje syntax hlavných JavaScript súborov.
- `npm run build` — overí dáta a pripraví priečinok `dist/`.
- `npm run deploy` — nasadí pripravený web cez Wrangler.

## Automatické obnovenie

Workflow `.github/workflows/refresh-and-deploy.yml` beží po každom pushi do vetvy `main`, raz denne o 04:17 UTC a dá sa spustiť aj ručne. Najskôr vykoná testy, potom získanie programu, zostavenie a nasadenie.

V GitHub repozitári treba nastaviť Actions secret `DOKINACLOUDFLARE`
s API tokenom pre nasadenie. Cloudflare account ID je nesenzitívna hodnota
uvedená priamo vo workflow.

Voliteľné plagáty a filmové metadáta sa získavajú cez TMDB; IMDb hodnotenia
pochádzajú z OMDb. Obe služby používajú samostatnú cache. Do lokálneho `.env`
a GitHub Actions secrets pridaj `TMDB_API_KEY` a `OMDB_API_KEY`. Priame odkazy
na Rotten Tomatoes a Metacritic sa bez API kľúča dopĺňajú z Wikidata podľa IMDb
ID; ak presné ID chýba, web odkazuje na vyhľadávanie služby. TMDB používa
API kľúč (v3) z
[nastavení TMDB](https://www.themoviedb.org/settings/api), nie prihlasovacie heslo.
Kľúče zostávajú iba v scrapere; do statického webu sa nezapisujú.
TMDB zároveň dodáva samostatnú sekciu „Očakávame“: najviac šesť populárnych
premiér na nasledujúcich 120 dní, štandardne štyri pre slovenské kiná a dve
výrazné svetové premiéry bez potvrdeného slovenského dátumu. Tieto položky sú uložené
v `upcomingMovies`, nemajú predstavenia a nevstupujú do filtrov ani počtov programu.
TMDB sa páruje podľa pôvodných, slovenských a alternatívnych názvov; overuje sa
dostupný rok (±1 rok), réžia a dĺžka. Viacero zhodných filmov sa automaticky
nepáruje. Dopĺňa TMDB a IMDb ID, pôvodný názov, réžiu, rok, dĺžku a popis
s prednosťou slovenčiny, potom češtiny a angličtiny. Pri potvrdenej zhode TMDB
plagát nahradí obrázok kina; vyberá sa v poradí slovenčina, čeština, bez textu
a angličtina. OMDb následne podľa IMDb ID doplní IMDb hodnotenie a počet hlasov.
Cache úspešných zhôd sa obnovuje denne a neúspešné zhody raz za sedem dní.
ID odkazov kritikov sa cachujú v `.cache/critic-links.json`; automatické
dopĺňanie sa dá vypnúť cez `CRITIC_LINKS_ENABLED=false` alebo presmerovať cez
`CRITIC_LINKS_CACHE_PATH`.

ČSFD hodnotenia sa získavajú cez neoficiálny `node-csfd-api` bez API kľúča.
ČSFD sa spracuje pred TMDB a OMDb: potvrdené alternatívne názvy pomáhajú
nájsť film aj pod zahraničným názvom. Vyžaduje sa zhoda názvu a roku alebo
réžie; dostupná réžia a dĺžka nesmú odporovať výsledku. Rozdiel roka o jeden
sa povoľuje iba pri zhodnom režisérovi. Nejednoznačné výsledky sa vynechajú.
TMDB navyše kontroluje názvy z prekladov a pri prázdnom vyhľadávaní s rokom
skúsi názov bez filtra roka, stále s následnou kontrolou metadát.
ČSFD požiadavky bežia postupne s odstupom aspoň 700 ms a cache v
`.cache/csfd.json`. Po troch po sebe idúcich chybách sa ČSFD pre daný beh
preskočí a zachovajú sa uložené hodnotenia. Vypnutie: `CSFD_ENABLED=false`;
vlastná cesta cache: `CSFD_CACHE_PATH`.
Web zobrazuje IMDb a ČSFD oddelene a umožňuje radenie podľa každého zdroja.
Filmy bez hodnotenia vybraného zdroja sú na konci; skóre sa nemiešajú.

`npm run refresh:ratings` doplní hodnotenia a metadáta existujúceho programu
bez obnovovania predstavení či času získania programu. Diagnostika v
`.cache/rating-audit.json` obsahuje pokrytie a dôvod chýbajúceho IMDb ratingu:
`key-missing`, `not-found`, `rating-unavailable` alebo `service-error`.
`not-checked` a `identity-missing` znamenajú, že výsledok dotazu nie je dostupný.
Rovnaký report vytvára pravidelný scraper a workflow ho ukladá do artefaktu.
Fixture `tests/fixtures/csfd-movie.json` je zúžená verejná odpoveď knižnice
pre film Pět švestek z 8. 9. 2026; offline testy overujú párovanie a výpadky.

Bez niektorého kľúča scraper aj web fungujú ďalej so zachovanými údajmi
z predchádzajúceho programu alebo príslušnej lokálnej cache.
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
originálnych a anglických názvov; po doplnení metadát aj podľa IMDb a TMDB ID.
Normalizácia ignoruje veľkosť písmen, diakritiku, interpunkciu a známe prípony
predstavení. Preklep v jednom písmene pri názve s aspoň šiestimi znakmi sa
akceptuje iba pri rovnakom roku a zhodnej réžii alebo dĺžke (rozdiel do 2 minút).
Zhodné TMDB ID umožňuje spárovať aj odlišné názvy. Rozporné IMDb/TMDB ID,
roky, režiséri alebo dĺžky s rozdielom nad 5 minút spájanie zablokujú.
Výnimka pre rok výroby verzus lokálnej premiéry povoľuje rozdiel presne jedného
roka, iba ak sa zhoduje normalizovaný názov, réžia aj dĺžka (do 2 minút).
Samotný podobný názov na túto výnimku nestačí. Konfliktné databázové ID
zostávajú prekážkou. Nejednoznačné zhody zostávajú oddelené. Najúplnejší záznam dodá
názov a ID, ostatné doplnia chýbajúce údaje a žánre. Všetky predstavenia,
ich pôvodné ID a odkazy na vstupenky zostávajú zachované.

Audit používa rovnaké pravidlá a skupiny ako scraper. `ZLÚČIŤ` znamená, že
deduplikácia dvojicu spojí; `PREVERIŤ` označuje konflikt metadát, nedostatok
dôkazov alebo nejednoznačnú skupinu. Vypíše zdroje, roky, ID a konkrétne
konfliktné polia. Ani podozrivá dvojica nemusí byť duplicita (napríklad
film a sprievodné podujatie). Na audit stiahnutých produkčných dát použi
`npm run audit:duplicates -- cesta/program.json`; pre strojový JSON výstup
`node scripts/audit-duplicates.mjs cesta/program.json --json`.
Automatický refresh ukladá report zostávajúcich kandidátov do
`duplicate-audit.json` spolu s programom v diagnostickom artefakte `program-json`.

## Údržba parserov

Ak zdroj zmení formát, najprv ulož anonymizovanú reprezentatívnu odpoveď do `tests/fixtures/`, uprav čistú parser funkciu a až potom aktualizuj sieťovú časť. Testy zámerne nepoužívajú živé weby, aby boli spoľahlivé.
