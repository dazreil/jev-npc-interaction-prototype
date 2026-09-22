import { cp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Copies only the public game files into dist/, matching the allowlist in
// server.mjs, so static hosts never publish server code, tests or notes.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(projectRoot, "dist");
const PUBLIC_ENTRIES = ["index.html", "styles.css", "assets", "data", "js"];

await rm(output, { recursive: true, force: true });
await Promise.all(
  PUBLIC_ENTRIES.map((entry) =>
    cp(resolve(projectRoot, entry), resolve(output, entry), {
      recursive: true,
      filter: (source) => !source.split("/").pop().startsWith(".")
    })
  )
);

console.log(`Built static game in dist/ (${PUBLIC_ENTRIES.join(", ")}).`);
