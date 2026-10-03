// Vault compiler (ENGINE_SPEC.md section 11). Reads every note in game/ that
// has a `type` property and returns plain JSON: its properties, the YAML
// block under each heading, and every section's own text (for line sections
// and prose such as an action's criteria). Links become ids, and asset links
// become URLs. Token links such as [[address]] stay as written.
//
//   node scripts/compile-vault.mjs          writes build/vault.json
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { buildWorld } from "../js/engine/canvas-world.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// The vault to use: game/ (the gate game), or another, such as
// GAME_VAULT=silver-edit. Every tool reads it from here.
export const VAULT_DIR = resolve(ROOT, process.env.GAME_VAULT || "game");
/** The vault folder as served to the game page, such as "game/". */
export const VAULT_URL_PREFIX = `${relative(ROOT, VAULT_DIR).split(sep).join("/")}/`;
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

/**
 * Every heading in order, with its depth and the text under it up to the
 * next heading (%% comments %% removed), and `data`: its first YAML block,
 * parsed. Line sections and prose are read from these. (Blocks keep only the
 * first heading of a name; sections keep them all, such as a branch that
 * appears under two tones.)
 */
function readSections(body, errors, where) {
  const sections = [];
  let current = null;
  let fenced = false;
  for (const line of body.replace(/%%[\s\S]*?%%/g, "").split("\n")) {
    if (/^```/.test(line.trim())) fenced = !fenced;
    const title = !fenced && line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (title) {
      current = { depth: title[1].length, title: title[2], lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return sections.map(({ depth, title, lines }) => {
    const text = lines.join("\n").trim();
    const section = { depth, title, text };
    const yaml = text.match(/^```ya?ml\s*\n([\s\S]*?)\n```/m);
    if (yaml) {
      try {
        section.data = YAML.parse(yaml[1]);
      } catch (error) {
        errors.push(`${where}: bad YAML under "${title}": ${error.message.split("\n")[0]}`);
      }
    }
    return section;
  });
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

/**
 * A dialogue tree canvas (ENGINE_SPEC.md section 5.5). Each text card that
 * starts "## name" then "open" or "script" is a node: its other plain lines
 * are commands (say, action, tone, cue, end, effects), and a ```yaml `do:`
 * block adds effects. Arrows keep their labels. The start node is the first
 * node no arrow points to.
 */
function readTree(canvas, lookup) {
  const nodes = {};
  const names = new Map();
  for (const card of canvas.nodes ?? []) {
    if (card.type !== "text") continue;
    const lines = String(card.text ?? "").split("\n");
    const name = lines[0].match(/^##\s+([\w.-]+)\s*$/)?.[1];
    const kind = lines[1]?.trim();
    if (!name || !["open", "script"].includes(kind)) continue;
    const body = lines.slice(2).join("\n");
    const yaml = body.match(/```ya?ml\s*\n([\s\S]*?)\n```/);
    const commands = body
      .replace(/```[\s\S]*?```/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    nodes[name] = {
      kind,
      commands: resolveLinks(commands, lookup),
      do: resolveLinks(yaml ? [].concat(YAML.parse(yaml[1])?.do ?? []) : [], lookup)
    };
    names.set(card.id, name);
  }
  const edges = (canvas.edges ?? [])
    .filter((edge) => names.has(edge.fromNode) && names.has(edge.toNode))
    .map((edge) => ({ from: names.get(edge.fromNode), to: names.get(edge.toNode), label: String(edge.label ?? "").trim() }));
  const targets = new Set(edges.map((edge) => edge.to));
  const start = [...names.values()].find((name) => !targets.has(name)) ?? null;
  return { nodes, edges, start };
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
      if (TOKENS.has(key)) return `[[${target.trim()}]]`;
      if (assets.has(key)) return assets.get(key);
      if (!ids.has(key) && !ids.has(`${key}.md`) && !TOKENS.has(key)) errors.push(`${where}: link to missing "${target}"`);
      return target.trim();
    };
    const id = file.split(sep).pop().replace(/\.md$/, "");
    notes[id] = {
      type: props.type,
      path: where,
      props: resolveLinks(props, lookup),
      blocks: resolveLinks(readBlocks(body, errors, where), lookup),
      sections: resolveLinks(readSections(body, errors, where), lookup)
    };
  }

  // The world canvas named in Game.md (world: "[[World.canvas]]") holds the
  // screens: what is where, and how screens connect.
  let world = null;
  let worldPath = null;
  const worldName = Object.values(notes).find((note) => note.type === "game")?.props.world;
  if (worldName) {
    const file = files.find((path) => path.split(sep).pop().toLowerCase() === String(worldName).toLowerCase());
    if (!file) {
      errors.push(`Game.md: world canvas "${worldName}" not found`);
    } else {
      try {
        const canvas = JSON.parse(await readFile(file, "utf8"));
        worldPath = relative(vaultDir, file).split(sep).join("/");
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

  // Dialogue trees named by character notes (tree: "[[arthur-tree.canvas]]").
  const trees = {};
  for (const [id, note] of Object.entries(notes)) {
    const treeName = note.type === "character" ? note.props.tree : null;
    if (!treeName) continue;
    const file = files.find((path) => path.split(sep).pop().toLowerCase() === String(treeName).toLowerCase());
    if (!file) {
      errors.push(`${id}: tree "${treeName}" not found`);
      continue;
    }
    try {
      trees[treeName] = readTree(JSON.parse(await readFile(file, "utf8")), (target) => target.trim());
    } catch (error) {
      errors.push(`${treeName}: ${error.message}`);
    }
  }

  return { builtAt: new Date().toISOString(), notes, world: world?.screens ?? null, worldPath, trees, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const vault = await compileVault();
  await mkdir(join(ROOT, "build"), { recursive: true });
  await writeFile(join(ROOT, "build", "vault.json"), JSON.stringify(vault, null, 2));
  console.log(`Compiled ${Object.keys(vault.notes).length} notes to build/vault.json.`);
  for (const error of vault.errors) console.log(`  - ${error}`);
  if (vault.errors.length) process.exitCode = 1;
}
