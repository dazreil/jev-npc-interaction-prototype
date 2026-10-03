// Saves what the screen editor changed back into the vault (ENGINE_SPEC.md
// section 12.7). It only touches what was edited: card boxes and order on a
// canvas, and the `at` and order of elements in a UI note's `## Elements`
// block. Comments and the rest of each file stay as they were.
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";
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

/** A card id not yet used on the canvas. */
function freeId(canvas, base) {
  const used = new Set([...canvas.nodes, ...(canvas.edges ?? [])].map((item) => item.id));
  let id = base;
  for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

/**
 * Changes a canvas file: new screens (a group with its picture, placed below
 * everything else), new cards and arrows, card boxes, pictures' focus, and order.
 */
export function editCanvas(text, { screens = [], add = [], links = [], unlinks = [], remove = [], cards = [], exits = [], boxes = [], order = null, focus = [] } = {}) {
  const canvas = JSON.parse(text);
  canvas.edges ??= [];
  for (const { label, file, width, height } of screens) {
    if (canvas.nodes.some((node) => node.type === "group" && String(node.label).trim() === label)) throw new Error(`A screen named ${label} already exists`);
    const bottom = Math.max(0, ...canvas.nodes.map((node) => node.y + node.height));
    const pictureHeight = Math.round((1280 * height) / width);
    const y = bottom + 400;
    canvas.nodes.push({ id: freeId(canvas, `screen-${label}`), type: "group", label, x: 0, y, width: 1360, height: pictureHeight + 100 });
    canvas.nodes.push({ id: freeId(canvas, `${label}-picture`), type: "file", file, x: 40, y: y + 60, width: 1280, height: pictureHeight });
  }
  // New cards keep the id the editor gave them, so later boxes and arrows find them.
  // A new card is a file card, or a text card when it has `text` (an exit).
  for (const { node, file, text, x, y, width, height } of add) {
    if (canvas.nodes.some((item) => item.id === node)) throw new Error(`Card ${node} is already on the canvas`);
    const box = { x: Math.round(x), y: Math.round(y), width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
    canvas.nodes.push(text != null ? { id: node, type: "text", text, ...box } : { id: node, type: "file", file, ...box });
  }
  // Card settings: a text card's text, an image card's file, and `if` (null removes it).
  for (const { node, ...fields } of cards) {
    const card = canvas.nodes.find((item) => item.id === node);
    if (!card) throw new Error(`No card ${node} on the canvas`);
    for (const [key, value] of Object.entries(fields)) {
      if (!["text", "file", "if"].includes(key)) continue;
      if (value === null || value === "") delete card[key];
      else card[key] = value;
    }
  }
  // Exits: the arrow from the exit's card to the screen it goes to (one per exit).
  const groups = new Map(canvas.nodes.filter((node) => node.type === "group").map((node) => [String(node.label).trim(), node.id]));
  for (const { node, to, condition } of exits) {
    const group = groups.get(to);
    if (!group) throw new Error(`No screen named ${to} on the canvas`);
    canvas.edges = canvas.edges.filter((edge) => !(edge.fromNode === node && [...groups.values()].includes(edge.toNode)));
    canvas.edges.push({ id: freeId(canvas, `${node}-to-${to}`), fromNode: node, fromSide: "right", toNode: group, toSide: "left", ...(condition ? { label: `if ${condition}` } : {}) });
  }
  for (const { from, to, label } of links) {
    if (!canvas.edges.some((edge) => edge.fromNode === from && edge.toNode === to)) canvas.edges.push({ id: freeId(canvas, `${from}-${label ?? "to"}`), fromNode: from, fromSide: "bottom", toNode: to, toSide: "bottom", label });
  }
  for (const { from, to } of unlinks) canvas.edges = canvas.edges.filter((edge) => !(edge.fromNode === from && edge.toNode === to));
  // Cards taken off a screen, and their arrows.
  if (remove.length) {
    const gone = new Set(remove);
    canvas.nodes = canvas.nodes.filter((node) => !gone.has(node.id));
    canvas.edges = canvas.edges.filter((edge) => !gone.has(edge.fromNode) && !gone.has(edge.toNode));
  }
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
export function editUiNote(text, { boxes = [], order = null, settings = [] } = {}) {
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

  // Settings of elements (any key but type and at; null removes it). Each
  // setting is changed, added or removed in place, one at a time, so the rest
  // of the element and the note keep their text and formatting.
  // Lists and maps are written on one line, padded like the text they replace.
  // Maps get "{ a: 1 }" when the note pads them, lists stay "[a, b]".
  const inline = (value, padded = false) => {
    if (Array.isArray(value)) return `[${value.map((item) => inline(item, padded)).join(", ")}]`;
    if (value && typeof value === "object") {
      const inner = Object.entries(value).map(([key, item]) => `${key}: ${inline(item, padded)}`).join(", ");
      return padded ? `{ ${inner} }` : `{${inner}}`;
    }
    return YAML.stringify(value, { lineWidth: 0 }).trim();
  };
  const lineStart = (offset) => block.lastIndexOf("\n", offset - 1) + 1;
  for (const { index, values } of settings) {
    for (const [key, value] of Object.entries(values)) {
      if (key === "type" || key === "at") continue;
      const item = YAML.parseDocument(block).contents?.items?.[index];
      if (!YAML.isMap(item)) throw new Error(`No element ${index} to change`);
      const pairs = item.items;
      const at = pairs.findIndex((pair) => pair.key?.value === key);
      const pair = pairs[at];
      const valueEnd = (one) => one.value?.range?.[1] ?? one.key.range[1];
      let from;
      let to;
      let text;
      if (pair && value === null) {
        if (item.flow) {
          // ", key: value" (or "key: value, " when it is the first)
          [from, to] = at > 0 ? [valueEnd(pairs[at - 1]), valueEnd(pair)] : [pair.key.range[0], pairs[1]?.key.range[0] ?? valueEnd(pair)];
        } else {
          from = lineStart(pair.key.range[0]);
          const end = block.indexOf("\n", valueEnd(pair) - 1);
          to = end < 0 ? block.length : end + 1;
        }
        text = "";
      } else if (pair) {
        [from, to] = [pair.key.range[1], valueEnd(pair)];
        const trailing = block.slice(from, to).match(/\s*$/)[0];
        text = `: ${inline(value, /^\{ /.test(block.slice(from, to).replace(/^:\s*/, "")))}${trailing.includes("\n") ? "\n" : ""}`;
      } else if (value !== null) {
        const last = pairs[pairs.length - 1];
        let end = valueEnd(last);
        if (item.flow) {
          text = `, ${key}: ${inline(value, true)}`;
        } else {
          // A new line under the element, lined up with its first key.
          if (block[end - 1] === "\n") end -= 1;
          const lineEnd = block.indexOf("\n", end);
          end = lineEnd < 0 ? block.length : lineEnd;
          text = `\n${" ".repeat(pairs[0].key.range[0] - lineStart(pairs[0].key.range[0]))}${key}: ${inline(value, true)}`;
        }
        [from, to] = [end, end];
      } else {
        continue;
      }
      block = block.slice(0, from) + text + block.slice(to);
    }
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
    // null removes the property: its whole line (or lines, for a block list).
    if (value === null) {
      if (!pair) return null;
      const lineStart = front.lastIndexOf("\n", pair.key.range[0] - 1) + 1;
      const end = front.indexOf("\n", pair.value?.range?.[1] ? pair.value.range[1] - 1 : pair.key.range[1]);
      return { from: lineStart, to: end < 0 ? front.length : end + 1, text: "", remove: true };
    }
    const item = (entry) => (typeof entry === "string" && /^[\w .=<>!'-]+$/.test(entry) ? entry : JSON.stringify(entry));
    const formatted = Array.isArray(value) ? `[${value.map(item).join(", ")}]` : JSON.stringify(value);
    // A new property goes at the end of the Properties (added below, in order).
    if (!pair) return { append: `\n${key}: ${formatted}` };
    return { from: pair.key.range[1], to: pair.value.range[1], text: `: ${formatted}` };
  });
  const appended = changes.filter((change) => change?.append).map((change) => change.append).join("");
  for (const change of changes.filter((item) => item && !item.append).sort((left, right) => right.from - left.from)) {
    if (change.remove) {
      front = front.slice(0, change.from) + front.slice(change.to);
      continue;
    }
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
export async function applyEdits(vaultDir, { canvases = {}, notes = {}, create = {}, since = null, force = false } = {}) {
  // New notes (a new screen's note): never over a file that is already there.
  for (const path of Object.keys(create)) {
    if (!path.endsWith(".md")) throw new Error(`Only notes can be made: ${path}`);
    if (await stat(inside(vaultDir, path)).then(() => true, () => false)) throw new Error(`${path} already exists`);
  }
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
  for (const [path, text] of Object.entries(create)) {
    const full = inside(vaultDir, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, text, { flag: "wx" });
    saved.push(path);
  }
  for (const [path, edits] of Object.entries(canvases)) {
    const full = inside(vaultDir, path);
    await writeFile(full, editCanvas(await readFile(full, "utf8"), edits));
    saved.push(path);
  }
  for (const [path, edits] of Object.entries(notes)) {
    const full = inside(vaultDir, path);
    let text = await readFile(full, "utf8");
    if (edits.props) text = editProps(text, edits.props);
    if (edits.boxes?.length || edits.order || edits.settings?.length) text = editUiNote(text, edits);
    await writeFile(full, text);
    saved.push(path);
  }
  return { saved, conflicts };
}
