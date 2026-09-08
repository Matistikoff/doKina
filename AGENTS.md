# Repository Guidelines

## Project Structure & Module Organization

doKina.sk aggregates Bratislava cinema listings into a static Slovak-language website.

- `site/`: plain HTML, CSS, browser JavaScript, image assets, and generated `program.json`.
- `scraper/`: data collection, normalization, schema validation, and TMDB enrichment. Cinema-specific adapters live in `scraper/sources/`; shared configuration and helpers live in `config.mjs` and `utils.mjs`.
- `scripts/`: local server and build scripts.
- `tests/`: Node.js tests and saved HTML responses in `tests/fixtures/`.
- `.github/workflows/`: validation and scheduled refresh/deployment. `wrangler.jsonc` configures Cloudflare Workers; `dist/` is generated output.

## Build, Test, and Development Commands

Use Node.js 22 or newer; CI uses Node.js 24.

- `npm ci`: install dependencies from the lockfile.
- `npm run serve`: serve `site/` at `http://127.0.0.1:4173`; override the port with `PORT`.
- `npm test`: run the offline test suite.
- `npm run check`: check syntax in `site/app.js` and `scraper/index.mjs`.
- `npm run scrape`: fetch live listings and overwrite `site/program.json`.
- `npm run build`: validate program data and recreate `dist/` from `site/`.
- `npm run deploy`: deploy the prepared build through Wrangler.

## Coding Style & Naming Conventions

Follow existing JavaScript conventions: two-space indentation, double quotes, semicolons, and ES modules. Use `.mjs` for Node.js modules, camelCase for functions and variables, and UPPER_SNAKE_CASE for configuration constants. Name cinema adapters with lowercase hyphenated names, such as `kino-lumiere.mjs`. No formatter or linter is configured; preserve surrounding style and Slovak UI text.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`, with filenames ending in `.test.mjs`. No coverage threshold is configured. For parser changes, save an anonymized representative fixture, update the pure parser, and add regression assertions before changing network handling. Keep tests independent of live websites. Preserve stable screening IDs, Bratislava timezone offsets, and partial-source failure handling. Run `npm test`, `npm run check`, and `npm run build` before submitting.

## Commit & Pull Request Guidelines

History uses short imperative subjects, such as `Add A4 Kino inak scraper`; follow that style. Keep changes focused. PRs should describe the behavior change, link relevant issues, and report validation commands. Include screenshots for visual changes and fixture details for parser fixes.

## Security & Configuration

Keep secrets out of Git. Deployment uses the `DOKINACLOUDFLARE` Actions secret; optional movie metadata uses `TMDB_API_KEY`. Do not commit `.env`, `.dev.vars`, caches, or build output.
