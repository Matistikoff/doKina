import { readFile } from "node:fs/promises";
import { auditMovieDuplicates } from "../scraper/deduplicate.mjs";
import { validateProgram } from "../scraper/schema.mjs";

const args = process.argv.slice(2);
const path = args.find((arg) => arg !== "--json") || new URL("../site/program.json", import.meta.url);
const program = validateProgram(JSON.parse(await readFile(path, "utf8")));
const findings = auditMovieDuplicates(program);
if (args.includes("--json")) {
  console.log(JSON.stringify({ generatedAt: program.generatedAt, findings }, null, 2));
} else {
  console.log(`Audit ${program.movies.length} filmov (dáta z ${program.generatedAt}): ${findings.length} podozrivých dvojíc.`);
  for (const finding of findings) {
    console.log(`\n${finding.status === "merge" ? "ZLÚČIŤ" : "PREVERIŤ"}: ${finding.titles.join(" / ")}`);
    console.log(`  ${finding.movieIds.join(" / ")}`);
    console.log(`  Zdroje: ${finding.sources.join(" / ")}; roky: ${finding.years.join(" / ")}`);
    console.log(`  Zhoda: ${finding.reason}; konflikty: ${finding.conflicts.join(", ") || "žiadne"}`);
    console.log(`  ${finding.canonicalId ? `Výsledné ID: ${finding.canonicalId}` : `Dôvod kontroly: ${finding.reviewReason}`}`);
  }
}
