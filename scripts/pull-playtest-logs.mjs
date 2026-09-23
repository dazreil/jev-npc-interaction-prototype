import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { get, list } from "@vercel/blob";

// Downloads every saved playtest log from the private Blob store into
// playtest-logs/. Run `vercel env pull .env.local` first if the token is missing.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(projectRoot, "playtest-logs");

for (const file of [".env.local", ".env"]) {
  let contents;
  try {
    contents = readFileSync(resolve(projectRoot, file), "utf8");
  } catch {
    continue;
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN is missing. Run: vercel env pull .env.local");
  process.exit(1);
}

await mkdir(output, { recursive: true });

let cursor;
let saved = 0;
do {
  const page = await list({ prefix: "logs/", cursor });
  for (const blob of page.blobs) {
    const result = await get(blob.pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) continue;
    const text = await new Response(result.stream).text();
    await writeFile(resolve(output, basename(blob.pathname)), text, "utf8");
    saved += 1;
  }
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);

console.log(`Saved ${saved} playtest log${saved === 1 ? "" : "s"} to playtest-logs/.`);
