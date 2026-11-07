import { readFile } from "node:fs/promises";
import { planRetentionCleanup } from "./plan.mjs";

if (process.argv.length !== 4 || process.argv[2] !== "--dry-run") {
	console.error("Usage: node scripts/retention/dry-run.mjs --dry-run <sanitized-snapshot.json>");
	process.exit(2);
}
const snapshot = JSON.parse(await readFile(process.argv[3], "utf8"));
console.log(JSON.stringify(planRetentionCleanup(snapshot), null, 2));
