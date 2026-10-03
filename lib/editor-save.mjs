// Saves what the screen editor changed back into the vault (ENGINE_SPEC.md
// section 12.7). It only touches what was edited: card boxes and order on a
// canvas, and the `at` and order of elements in a UI note's `## Elements`
// block. Comments and the rest of each file stay as they were.
import { readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, normalize, relative } from "node:path";
import YAML from "yaml";

const FENCE_START = /^```ya?ml\s*$/;

function inside(vaultDir, path) {
  const full = normalize(join(vaultDir, path));
  const rel = relative(vaultDir, full);
  if (!path || isAbsolute(path) || rel.startsWith("..") || rel.split(/[\\/]/).some((part) => part.startsWith("."))) {
    throw new Error(`Not a vault file: ${path}`);
  }
  return full;
}

/** Moves `ids` (in their new order) into the slots those ids held before. */
function reorder(list, ids, key = (item) => item.id) {
  const wanted = ids.filter((id) => list.some((item) => key(item) === id));
  const slots = list.map((item, index) => (wanted.includes(key(item)) ? index : -1)).filter((index) => index >= 0);
  const byId = new Map(list.map((item) => [key(item), item]));
  const next = [...list];
  slots.forEach((slot, n) => (next[slot] = byId.get(wanted[n])));
  return next;
}

/** Changes card boxes and order on a canvas file. */
export function editCanvas(text, { boxes = [], order = null, focus = [] } = {}) {
  const canvas = JSON.parse(text);
  // Where a picture sits inside its card (percent): kept on the card itself.
  for (const { node, value } of focus) {
    const card = canvas.nodes.find((item) => item.id === node);
    if (!card) throw new Error(`No card ${node} on the canvas`);
    card.focus = value.map((n) => Math.round(n));
  }
  for (const { node, x, y, width, height } of boxes) {
    const card = canvas.nodes.find((item) => item.id === node);
    if (!card) throw new Error(`No card ${node} on the canvas`);
    Object.assign(card, { x: Math.round(x), y: Math.round(y), width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) });
  }
  if (order) canvas.nodes = reorder(canvas.nodes, order);
  return JSON.stringify(canvas, null, "\t");
}

/** The line range of the YAML block under "## Elements". */
function elementsBlock(lines) {
  const heading = lines.findIndex((line) => /^#{1,6}\s+Elements\s*$/.test(line));
  if (heading < 0) throw new Error("No ## Elements block");
  const start = lines.findIndex((line, index) => index > heading && FENCE_START.test(line.trim()));
  const end = lines.findIndex((line, index) => index > start && line.trim() === "```");
  if (start < 0 || end < 0) throw new Error("The ## Elements block has no ```yaml fence");
  return { start, end };
}

/**
 * Changes elements in a UI note: `at` by index (top-level elements), and the
 * order (a list of old indexes in their new order). Only the changed text is
 * replaced, so the note keeps its comments and its own formatting.
 */
export function editUiNote(text, { boxes = [], order = null } = {}) {
  const lines = text.split("\n");
  const { start, end } = elementsBlock(lines);
  let block = lines.slice(start + 1, end).join("\n");
  let items = YAML.parseDocument(block).contents?.items;
  if (!Array.isArray(items)) throw new Error("## Elements is not a list");

  // Replace each changed `at` value in place, last first so offsets hold.
  // Replace from just after the key, so a list written over several lines
  // becomes one line; keep the line break that ends it.
  const changes = boxes.map(({ index, at }) => {
    const pair = items[index]?.items?.find((item) => item.key?.value === "at");
    if (!pair?.value?.range) throw new Error(`Element ${index} has no at to change`);
    return { from: pair.key.range[1], to: pair.value.range[1], text: `: [${at.map((n) => Math.round(n)).join(", ")}]` };
  });
  for (const change of changes.sort((left, right) => right.from - left.from)) {
    const trailing = block.slice(change.from, change.to).match(/\s*$/)[0];
    block = block.slice(0, change.from) + change.text + (trailing.includes("\n") ? "\n" : "") + block.slice(change.to);
  }

  if (order) {
    items = YAML.parseDocument(block).contents.items;
    if (order.length !== items.length || new Set(order).size !== order.length) throw new Error("The new order must list every element once");
    // Each element owns its text from the line it starts on (with the
    // comments just above it) to the next element.
    const lineStart = (offset) => block.lastIndexOf("\n", offset - 1) + 1;
    const starts = items.map((item) => lineStart(item.range[0]));
    const firstStart = starts[0];
    const ownStart = starts.map((startAt, index) => {
      if (index === 0) return startAt;
      // Comment lines right above an element travel with it.
      let at = startAt;
      while (at > starts[index - 1]) {
        const previous = lineStart(at - 1);
        if (!/^\s*#/.test(block.slice(previous, at - 1))) break;
        at = previous;
      }
      return at;
    });
    const pieces = items.map((_, index) => {
      const piece = block.slice(ownStart[index], index + 1 < items.length ? ownStart[index + 1] : block.length);
      return piece.endsWith("\n") ? piece : `${piece}\n`;
    });
    block = block.slice(0, firstStart) + order.map((index) => pieces[index]).join("").replace(/\n$/, "");
  }
  return [...lines.slice(0, start + 1), block, ...lines.slice(end)].join("\n");
}

/**
 * Changes Properties (frontmatter) values in place, such as an object's
 * `panel`. Only the value's text is replaced.
 */
export function editProps(text, props = {}) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error("The note has no Properties");
  let front = match[1];
  const doc = YAML.parseDocument(front);
  const changes = Object.entries(props).map(([key, value]) => {
    const pair = doc.contents.items.find((item) => item.key?.value === key);
    const formatted = Array.isArray(value) ? `[${value.join(", ")}]` : JSON.stringify(value);
    // A new property goes at the end of the Properties (added below, in order).
    if (!pair) return { append: `\n${key}: ${formatted}` };
    return { from: pair.key.range[1], to: pair.value.range[1], text: `: ${formatted}` };
  });
  const appended = changes.filter((change) => change.append).map((change) => change.append).join("");
  for (const change of changes.filter((item) => !item.append).sort((left, right) => right.from - left.from)) {
    // A block list's range takes the line break after it; keep that break.
    const trailing = front.slice(change.from, change.to).match(/\s*$/)[0];
    front = front.slice(0, change.from) + change.text + (trailing.includes("\n") ? "\n" : "") + front.slice(change.to);
  }
  front += appended;
  return text.replace(match[1], () => front);
}

/**
 * Applies a save from the editor. `since` is when the editor loaded the
 * vault: a file changed after that (in Obsidian, say) is not overwritten,
 * unless `force` is set. Returns { saved, conflicts }.
 */
export async function applyEdits(vaultDir, { canvases = {}, notes = {}, since = null, force = false } = {}) {
  const files = [...Object.keys(canvases), ...Object.keys(notes)];
  const conflicts = [];
  if (since && !force) {
    for (const path of files) {
      const changed = (await stat(inside(vaultDir, path))).mtimeMs;
      if (changed > Date.parse(since) + 1000) conflicts.push(path);
    }
    if (conflicts.length) return { saved: [], conflicts };
  }
  const saved = [];
  for (const [path, edits] of Object.entries(canvases)) {
    const full = inside(vaultDir, path);
    await writeFile(full, editCanvas(await readFile(full, "utf8"), edits));
    saved.push(path);
  }
  for (const [path, edits] of Object.entries(notes)) {
    const full = inside(vaultDir, path);
    let text = await readFile(full, "utf8");
    if (edits.props) text = editProps(text, edits.props);
    if (edits.boxes?.length || edits.order) text = editUiNote(text, edits);
    await writeFile(full, text);
    saved.push(path);
  }
  return { saved, conflicts };
}
