// Builds the game's screens from an Obsidian Canvas (ENGINE_SPEC.md 7.3).
//
//   group                      a screen; its label is the screen id (it
//                              needs a screen note of that name or a picture)
//   image card in a group      the scene picture; it sets the screen's frame
//   other cards in the frame   placed where they sit on the picture
//     file card: image          an image layer
//     file card: object note    an in-world object, at that spot
//     file card: item note      an item lying there; a click picks it up
//     file card: ui note        a UI drawn in that box
//     text card                 text, or an image layer if it embeds a picture
//   `if <condition>` first line  the card shows only when the condition holds
//   `if: <condition>` on an image card  the same, for a picture
//   arrow to another screen    the source card becomes a button to go there;
//                              an arrow label `if <condition>` also gates it
//   arrow object → ui card     where that object's UI opens (if in the frame)
//   arrow object → image card  the object takes that picture's box and shape:
//                              only its solid pixels take clicks, and it
//                              moves with the picture
//   `focus: [x, y]` on an image card  where the picture sits inside its box
//
// Cards outside every screen group are notes for people; they are ignored.

const IMAGE_PATTERN = /\.(webp|png|jpe?g|gif|svg)$/i;
const EMBED_PATTERN = /!\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/;

const baseName = (path) => String(path).split("/").pop();
const noteId = (path) => baseName(path).replace(/\.md$/, "");

function contains(outer, inner) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** Splits a text card into an optional `if` condition and the rest. */
function readText(text) {
  const lines = String(text ?? "").split("\n");
  const first = lines[0]?.trim() ?? "";
  if (/^if\s+/i.test(first)) return { condition: first.replace(/^if\s+/i, ""), body: lines.slice(1).join("\n").trim() };
  return { condition: null, body: String(text ?? "").trim() };
}

function plain(body) {
  return body.replace(/^#+\s*/gm, "").replace(/\*\*|__/g, "").trim();
}

/**
 * @param canvas parsed JSON Canvas
 * @param options.notes compiled notes by id (to tell objects from UI notes)
 * @param options.asset (name) => URL, or null when it is not an asset
 * @param options.width screen width in game pixels (default 640)
 */
export function buildWorld(canvas, { notes = {}, asset = () => null, width = 640 } = {}) {
  const nodes = canvas?.nodes ?? [];
  const edges = canvas?.edges ?? [];
  const errors = [];
  const screens = {};
  const screenOf = new Map();
  // A group is a screen when a screen note has its name or it holds a
  // picture; other groups are notes for people.
  const hasPicture = (group) =>
    nodes.some((node) => node.type === "file" && IMAGE_PATTERN.test(node.file) && contains(group, node));
  const groups = nodes.filter(
    (node) => node.type === "group" && node.label && (notes[node.label.trim()]?.type === "screen" || hasPicture(node))
  );

  for (const group of groups) {
    const id = group.label.trim();
    const inside = nodes.filter((node) => node !== group && node.type !== "group" && contains(group, node));
    const picture = inside.find((node) => node.type === "file" && IMAGE_PATTERN.test(node.file));
    const frame = picture ?? group;
    const scale = width / frame.width;
    const place = (node) => [
      Math.round((node.x - frame.x) * scale),
      Math.round((node.y - frame.y) * scale),
      Math.round(node.width * scale),
      Math.round(node.height * scale)
    ];
    // `frame` lets the editor turn screen pixels back into canvas positions.
    const screen = {
      id,
      width,
      height: Math.round(frame.height * scale),
      frame: { x: frame.x, y: frame.y, unit: frame.width / width, picture: picture?.id ?? null },
      group: group.id,
      elements: [],
      objects: [],
      exits: [],
      place
    };
    screens[id] = screen;
    if (picture) screen.elements.push({ type: "image", id: `${id}-picture`, node: picture.id, at: place(picture), src: asset(baseName(picture.file)), fit: "cover" });

    for (const node of inside) {
      if (node === picture || !contains(frame, node)) continue;
      screenOf.set(node.id, id);
      const at = place(node);
      if (node.type === "file") {
        const name = baseName(node.file);
        if (IMAGE_PATTERN.test(name)) {
          // `focus: [x, y]` on the card (percent, 50 50 is the middle) slides the
          // picture inside its box; set with Option-drag in the editor.
          const image = { type: "image", id: node.id, node: node.id, at, src: asset(name), fit: "cover" };
          if (Array.isArray(node.focus)) image.focus = node.focus.map(Number);
          // `if: <condition>` on an image card: the picture shows only while it holds.
          if (node.if) image.visible = [String(node.if)];
          screen.elements.push(image);
          continue;
        }
        const note = notes[noteId(name)];
        if (note?.type === "object") screen.objects.push({ id: noteId(name), rect: at, node: node.id });
        // An item lying in the scene: click it to pick it up (it is then held).
        else if (note?.type === "item") screen.objects.push({ id: noteId(name), rect: at, node: node.id, item: true });
        else if (note?.type === "ui") screen.elements.push({ type: "ui", id: noteId(name), node: node.id, ui: noteId(name), at });
        else errors.push(`World canvas: card "${name}" on screen "${id}" is not an image, object, item, or ui note`);
      } else if (node.type === "text") {
        const { condition, body } = readText(node.text);
        const embed = body.match(EMBED_PATTERN);
        const visible = condition ? [condition] : undefined;
        if (embed && asset(embed[1].trim())) {
          screen.elements.push({ type: "image", id: node.id, node: node.id, at, src: asset(embed[1].trim()), fit: "cover", visible });
        } else if (embed && notes[embed[1].trim()]?.type === "ui") {
          screen.elements.push({ type: "ui", id: node.id, node: node.id, ui: embed[1].trim(), at, visible });
        } else {
          screen.elements.push({ type: "text", id: node.id, node: node.id, at, style: "card", text: plain(body), visible, card: node.id, raw: body, condition });
        }
      }
    }
  }

  const groupScreen = new Map(groups.map((group) => [group.id, group.label.trim()]));
  for (const edge of edges) {
    const fromScreen = screenOf.get(edge.fromNode);
    const toScreen = groupScreen.get(edge.toNode) ?? screenOf.get(edge.toNode);
    const label = String(edge.label ?? "").trim();
    const labelCondition = /^if\s+/i.test(label) ? label.replace(/^if\s+/i, "") : null;
    if (!fromScreen) continue;
    const screen = screens[fromScreen];

    // Object → UI card in the same frame: where that object's UI opens.
    const object = screen.objects.find((item) => item.node === edge.fromNode);
    const target = nodes.find((node) => node.id === edge.toNode);
    if (object && target?.type === "file" && notes[noteId(target.file)]?.type === "ui") {
      if (screenOf.get(target.id) === fromScreen) {
        object.panel = screen.place(target);
        screen.elements = screen.elements.filter((element) => element.id !== noteId(target.file));
      }
      continue;
    }

    // Object → image card in the same frame: the hotspot is that picture's shape.
    const picture = object && screen.elements.find((element) => element.type === "image" && element.node === edge.toNode);
    if (picture && picture.id !== `${fromScreen}-picture`) {
      object.rect = [...picture.at];
      object.mask = picture.src;
      if (picture.focus) object.maskFocus = picture.focus;
      // An item's picture goes once the player picks the item up.
      if (object.item) picture.visible = [...(picture.visible ?? []), `not item.${object.id}`];
      object.follows = picture.node;
      continue;
    }

    if (!toScreen || toScreen === fromScreen) continue;
    // A text card with an arrow to another screen is a button that goes there.
    const index = screen.elements.findIndex((element) => element.card === edge.fromNode);
    if (index < 0) continue;
    const text = screen.elements[index];
    screen.elements.splice(index, 1);
    const visible = [...(text.visible ?? []), ...(labelCondition ? [labelCondition] : [])];
    // `target`, `condition` and `edgeCondition` let the editor change the exit.
    screen.exits.push({
      type: "button",
      id: edge.fromNode,
      node: edge.fromNode,
      at: text.at,
      style: "exit",
      label: text.text,
      visible: visible.length ? visible : undefined,
      do: [`screen ${toScreen}`],
      target: toScreen,
      raw: text.raw,
      condition: text.condition ?? null,
      edgeCondition: labelCondition
    });
  }

  for (const screen of Object.values(screens)) {
    delete screen.place;
    for (const element of screen.elements) delete element.card;
  }
  return { screens, errors };
}
