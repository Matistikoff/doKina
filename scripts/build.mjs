import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateProgram } from "../scraper/schema.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const source = resolve(root, "site");
const destination = resolve(root, "dist");
const program = JSON.parse(await readFile(resolve(source, "program.json"), "utf8"));
validateProgram(program);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
console.log(`Built ${destination} with ${program.screenings.length} screenings.`);
