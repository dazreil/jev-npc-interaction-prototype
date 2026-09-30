// Vault compiler (ENGINE_SPEC.md section 11). Reads every note in game/ that
// has a `type` property and returns plain JSON: its properties, and the YAML
// block under each heading. Links become ids, and asset links become URLs.
//
//   node scripts/compile-vault.mjs          writes build/vault.json
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { buildWorld } from "../js/engine/canvas-world.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const VAULT_DIR = join(ROOT, "game");
const ASSET_PATTERN = /\.(webp|png|jpe?g|gif|svg|mp3|ogg|wav|ttf|woff2?)$/i;
const LINK_PATTERN = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
const TOKENS = new Set(["address", "playername"]);

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

function splitNote(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return match ? { frontmatter: match[1], body: match[2] } : { frontmatter: "", body: text };
}

/** Each heading's first ```yaml block, keyed by the heading text. */
function readBlocks(body, errors, where) {
  const blocks = {};
  let heading = null;
  let fence = null;
  let lines = [];
  body.split("\n").forEach((line, index) => {
    if (fence) {
      if (line.trim() === "```") {
        if (heading && !(heading in blocks)) {
          try {
            blocks[heading] = YAML.parse(lines.join("\n"));
          } catch (error) {
            errors.push(`${where} line ${fence.line}: bad YAML under "${heading}": ${error.message.split("\n")[0]}`);
          }
        }
        fence = null;
      } else {
        lines.push(line);
      }
      return;
    }
    const title = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (title) heading = title[1];
    else if (/^```ya?ml\s*$/.test(line.trim())) {
      fence = { line: index + 1 };
      lines = [];
    }
  });
  return blocks;
}

function resolveLinks(value, lookup) {
  if (typeof value === "string") {
    const whole = value.match(/^\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/);
    if (whole) return lookup(whole[1]);
    return value.replace(LINK_PATTERN, (_match, target) => lookup(target));
  }
  if (Array.isArray(value)) return value.map((item) => resolveLinks(item, lookup));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveLinks(item, lookup)]));
  }
  return value;
}

export async function compileVault(vaultDir = VAULT_DIR) {
  const files = await walk(vaultDir);
  const errors = [];
  const assets = new Map();
  const ids = new Map();
  for (const file of files) {
    const name = file.split(sep).pop();
    if (ASSET_PATTERN.test(name)) assets.set(name.toLowerCase(), `/${relative(ROOT, file).split(sep).join("/")}`);
    const id = name.replace(/\.md$/, "");
    if (ids.has(id.toLowerCase())) errors.push(`Two files named "${id}": ${ids.get(id.toLowerCase())} and ${relative(vaultDir, file)}`);
    ids.set(id.toLowerCase(), relative(vaultDir, file));
  }

  const notes = {};
  for (const file of files.filter((path) => path.endsWith(".md"))) {
    const where = relative(vaultDir, file);
    const { frontmatter, body } = splitNote(await readFile(file, "utf8"));
    let props;
    try {
      props = YAML.parse(frontmatter) ?? {};
    } catch (error) {
      errors.push(`${where}: bad Properties: ${error.message.split("\n")[0]}`);
      continue;
    }
    if (!props.type) continue;
    const lookup = (target) => {
      const key = target.trim().toLowerCase();
      if (assets.has(key)) return assets.get(key);
      if (!ids.has(key) && !ids.has(`${key}.md`) && !TOKENS.has(key)) errors.push(`${where}: link to missing "${target}"`);
      return target.trim();
    };
    const id = file.split(sep).pop().replace(/\.md$/, "");
    notes[id] = {
      type: props.type,
      path: where,
      props: resolveLinks(props, lookup),
      blocks: resolveLinks(readBlocks(body, errors, where), lookup)
    };
  }

  // The world canvas named in Game.md (world: "[[World.canvas]]") holds the
  // screens: what is where, and how screens connect.
  let world = null;
  const worldName = Object.values(notes).find((note) => note.type === "game")?.props.world;
  if (worldName) {
    const file = files.find((path) => path.split(sep).pop().toLowerCase() === String(worldName).toLowerCase());
    if (!file) {
      errors.push(`Game.md: world canvas "${worldName}" not found`);
    } else {
      try {
        const canvas = JSON.parse(await readFile(file, "utf8"));
        for (const node of canvas.nodes ?? []) {
          if (node.type === "file" && !ids.has(node.file.split("/").pop().replace(/\.md$/, "").toLowerCase())) {
            errors.push(`${worldName}: card points to missing file "${node.file}"`);
          }
        }
        world = buildWorld(canvas, { notes, asset: (name) => assets.get(String(name).toLowerCase()) ?? null });
        errors.push(...world.errors);
      } catch (error) {
        errors.push(`${worldName}: ${error.message}`);
      }
    }
  }

  return { builtAt: new Date().toISOString(), notes, world: world?.screens ?? null, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const vault = await compileVault();
  await mkdir(join(ROOT, "build"), { recursive: true });
  await writeFile(join(ROOT, "build", "vault.json"), JSON.stringify(vault, null, 2));
  console.log(`Compiled ${Object.keys(vault.notes).length} notes to build/vault.json.`);
  for (const error of vault.errors) console.log(`  - ${error}`);
  if (vault.errors.length) process.exitCode = 1;
}
