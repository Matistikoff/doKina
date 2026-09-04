# doKina.sk

Jednoduchý prehľad filmových predstavení v bratislavských kinách. Spája program Kina Lumière, Cinema City, Kina Film Europe, Kina Mladosť, Kina Lúky a Kina Nostalgia do jedného normalizovaného súboru `program.json`.

Frontend je čisté HTML, CSS a JavaScript. Node.js sa používa iba na získanie dát, testy a lokálny server.

## Zdroje dát

- **Cinema City:** verejný JSON endpoint používaný webom Cinema City.
- **Kino Lumière:** HTML kompletného programu; stránka neposkytuje štruktúrovaný JSON program.
- **Kino Film Europe a Kino Mladosť:** HTML programové tabuľky systému Cinemaware.
- **Kino Lúky:** verejný zoznam filmových podujatí Kultúrnych zariadení Petržalky.
- **Kino Nostalgia:** štruktúrované dáta programu vložené vo verejnej stránke kina.

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
fungujú ďalej, iba nezobrazia hodnotenia. Bezplatný OMDb kľúč má denný limit
1 000 požiadaviek a jeho obsah je dostupný pod licenciou CC BY-NC 4.0.
Pri filmoch Cinema City sa na presné párovanie používa aj anglická verzia
verejných dát kina, preto fungujú aj slovenské preklady názvov.

Token potrebuje oprávnenie nasadiť Cloudflare Worker. Projekt sa nasadzuje ako Cloudflare Worker so statickými assets z priečinka `dist/`.

## Štruktúra dát

`site/program.json` obsahuje čas vytvorenia, stav zdrojov, kiná, filmy a predstavenia. Časy sú uložené ako ISO 8601 s bratislavským UTC offsetom. Identifikátory predstavení sú odvodené zo zdrojových ID, aby boli stabilné medzi obnoveniami.

## Údržba parserov

Ak zdroj zmení formát, najprv ulož anonymizovanú reprezentatívnu odpoveď do `tests/fixtures/`, uprav čistú parser funkciu a až potom aktualizuj sieťovú časť. Testy zámerne nepoužívajú živé weby, aby boli spoľahlivé.
