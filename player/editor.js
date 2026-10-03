// The screen editor (Cmd+E in the desktop app; ENGINE_SPEC.md 12.7). It draws
// boxes over the real game screen: drag to move, drag a corner to resize
// (Shift keeps the shape), arrow keys nudge. Double-click a layer (a UI note
// such as the gate front) to edit the parts inside it. The layer list changes
// the drawing order; the switches show the screen with a flag on or off.
// Changes show at once and are saved into the vault with Save (Cmd+S): card
// boxes and order on the world canvas, element boxes and order in UI notes.

import { evaluate } from "/js/engine/conditions.js";
import { ELEMENT_PROPS, pictureShape, setEditorPreview } from "/js/engine/ui.js";

const PANEL_WIDTH = 320;
const round = (value) => Math.round(value);
const clone = (rect) => rect.map(Number);

export function createEditor({ session, stage, render, host, reloadVault }) {
  let on = false;
  let level = null; // null: the screen; else { uiId, box } (a UI layer opened for editing)
  let selected = null;
  let undo = [];
  let redo = [];
  const freshEdits = () => ({ boxes: new Map(), order: new Map(), props: new Map(), focus: new Map(), add: new Map(), links: new Map(), unlinks: new Map(), remove: new Map(), cards: new Map(), exits: new Map(), settings: new Map() });
  let edits = freshEdits();
  const editCount = () => Object.values(edits).reduce((count, map) => count + map.size, 0);
  let adding = null; // null, "picture", "thing" or "screen": the open part of the Add section
  let search = "";
  let screenName = "";
  let made = 0;
  let stale = false;
  let status = "";
  let lastClick = { key: null, at: 0 };
  let lastSave = null; // our own saves are not someone else's change
  const hidden = new Map(); // editor-only hiding: key → the element's own `visible`
  const original = new WeakMap(); // raw UI element → its index in the note when the editor opened

  const overlay = document.createElement("div");
  overlay.className = "editor-overlay";
  const panel = document.createElement("aside");
  panel.className = "editor-panel";
  panel.hidden = true; // until Cmd+E
  document.body.append(overlay, panel);

  const screenId = () => session.world.screen;
  const built = () => session.vault.world?.[screenId()];

  // ---------------------------------------------------------------- targets

  /** The layer for a screen-level UI target, for editing the parts inside it. */
  function layerOf(target) {
    const note = session.vault.notes[target.ref.ui];
    const at = target.ref[target.field];
    if (!note?.blocks.Elements || !Array.isArray(at)) return null;
    return { uiId: target.ref.ui, box: clone(at), width: Number(note.props.width) || at[2], height: Number(note.props.height) || at[3], label: target.label };
  }

  /** What can be edited at a level (the screen, or inside a layer), back to front. */
  function targets(lv = level) {
    const screen = built();
    if (!screen) return [];
    if (!lv) {
      // The scene picture sets the screen's frame, so it is not moved here.
      const linked = (element) => screen.objects.filter((object) => object.follows && object.follows === element.node).map((object) => object.id);
      const elements = screen.elements.filter((element) => element.id !== `${screen.id}-picture`).map((element) => ({
        key: `el:${element.node ?? element.id}`,
        label: element.type === "ui" ? element.ui : element.type === "text" ? `“${String(element.text).slice(0, 24)}”` : linked(element).length ? `${element.id} (click: ${linked(element).join(", ")})` : element.id,
        kind: element.type,
        ref: element,
        field: "at",
        node: element.node,
        orderable: element.id !== `${screen.id}-picture`,
        canOpen: element.type === "ui"
      }));
      // An object linked to a picture (an arrow on the canvas) moves with that
      // picture, so it is not a box of its own.
      const objects = screen.objects.filter((object) => !object.follows).map(objectTarget);
      const exits = screen.exits.map((exit) => ({ key: `exit:${exit.node}`, label: `${exit.label} (exit)`, kind: "exit", ref: exit, field: "at", node: exit.node }));
      // An object that is open (a talk panel, the intercom) shows its panel:
      // move it (saved as the object's `panel`), or open it to edit its parts.
      const panels = screen.objects
        .filter((object) => session.world.open?.[object.id] && Array.isArray(session.vault.notes[object.id]?.props.panel))
        .map((object) => {
          const props = session.vault.notes[object.id].props;
          return { key: `panel:${object.id}`, label: `${props.ui} (open panel)`, kind: "ui", ref: props, field: "panel", objectId: object.id, orderable: false, canOpen: true };
        });
      // While a panel is open the scene behind it is dimmed: only the panel
      // (and anything drawn above it, `layer: top`) can be picked.
      if (panels.length) return [...elements.filter((target) => target.ref.layer === "top"), ...panels];
      return [...elements, ...objects, ...exits];
    }
    const note = session.vault.notes[lv.uiId];
    const list = note?.blocks.Elements ?? [];
    list.forEach((element, index) => original.has(element) || original.set(element, index));
    return list
      .map((element, index) => ({
        lv,
        key: `ui:${lv.uiId}:${original.get(element)}`,
        label: element.id ?? (element.type === "slot" && element.name ? `${element.name} (slot)` : `${element.type} ${index + 1}`),
        kind: element.type,
        ref: element,
        field: "at",
        index,
        orderable: true
      }))
      .filter((target) => Array.isArray(target.ref.at));
  }

  function objectTarget(object) {
    return { key: `obj:${object.node}`, label: `${object.id} (object)`, kind: "object", ref: object, field: "rect", node: object.node };
  }

  /** A target's box in screen pixels. */
  function rectOf(target) {
    const at = target.ref[target.field];
    if (!target.lv) return clone(at);
    const { box, width, height } = target.lv;
    const sx = box[2] / width;
    const sy = box[3] / height;
    return [box[0] + at[0] * sx, box[1] + at[1] * sy, at[2] * sx, at[3] * sy];
  }

  /** Puts a box (in screen pixels) back onto the target, in its own units. */
  function setRect(target, rect) {
    if (!target.lv) {
      // A card must stay on the scene picture, or it drops out of the screen.
      const screen = built();
      let [x, y, w, h] = rect;
      w = Math.min(w, screen.width);
      h = Math.min(h, screen.height);
      x = Math.min(Math.max(0, x), screen.width - w);
      y = Math.min(Math.max(0, y), screen.height - h);
      target.ref[target.field] = [x, y, w, h].map(round);
      // Objects linked to this picture take its new box too.
      for (const object of screen.objects.filter((item) => item.follows && item.follows === target.node)) {
        object.rect = [...target.ref[target.field]];
        edits.boxes.set(`obj:${object.node}`, objectTarget(object));
      }
    } else {
      const { box, width, height } = target.lv;
      const sx = box[2] / width;
      const sy = box[3] / height;
      target.ref.at = [(rect[0] - box[0]) / sx, (rect[1] - box[1]) / sy, rect[2] / sx, rect[3] / sy].map(round);
    }
    edits.boxes.set(target.key, target);
  }

  // ---------------------------------------------------------------- undo

  function change(label, apply, revert) {
    apply();
    undo.push({ label, apply, revert });
    redo = [];
    refresh();
  }

  function moveTo(target, before, after) {
    change(`Move ${target.label}`, () => setRect(target, after), () => setRect(target, before));
  }

  // ---------------------------------------------------------------- drawing

  function scale() {
    const screen = built();
    return screen ? stage.clientWidth / screen.width : 1;
  }

  function refresh() {
    render();
    drawOverlay();
    drawPanel();
  }

  function drawOverlay() {
    overlay.replaceChildren();
    if (!on) return;
    const bounds = stage.getBoundingClientRect();
    Object.assign(overlay.style, { left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px` });
    const k = scale();
    if (level) {
      const frame = document.createElement("div");
      frame.className = "editor-level";
      const [x, y, w, h] = level.box;
      Object.assign(frame.style, { left: `${x * k}px`, top: `${y * k}px`, width: `${w * k}px`, height: `${h * k}px` });
      overlay.append(frame);
    }
    for (const target of targets()) {
      if (hidden.has(target.key)) continue;
      const [x, y, w, h] = rectOf(target);
      const box = document.createElement("div");
      box.className = `editor-box editor-${target.kind}${target.key === selected ? " selected" : ""}`;
      Object.assign(box.style, { left: `${x * k}px`, top: `${y * k}px`, width: `${w * k}px`, height: `${h * k}px` });
      box.title = target.label;
      // A picture with a linked click object shows that click shape inside its box.
      const object = isPicture(target) && built().objects.find((item) => item.follows && item.follows === target.node);
      if (object?.mask) {
        const clip = pictureShape(object.mask, w, h, "cover", object.maskFocus ?? [50, 50]);
        if (clip) {
          const shape = document.createElement("div");
          shape.className = "editor-shape";
          Object.assign(shape.style, { width: `${w}px`, height: `${h}px`, transform: `scale(${k})`, clipPath: clip });
          box.append(shape);
        }
      }
      if (target.key === selected) {
        const name = document.createElement("span");
        name.className = "editor-name";
        name.textContent = target.label;
        box.append(name);
        for (const corner of ["nw", "ne", "sw", "se"]) {
          const handle = document.createElement("i");
          handle.className = `editor-handle ${corner}`;
          handle.addEventListener("pointerdown", (event) => startDrag(event, target, corner));
          box.append(handle);
        }
      }
      overlay.append(box);
    }
  }

  // ---------------------------------------------------------------- pictures on the screen

  /** A picture card on the world canvas (not the scene picture itself). */
  const isPicture = (target) => !target?.lv && target?.kind === "image" && Boolean(target.node);

  /** Sets where a picture sits inside its box, and moves its linked click shape with it. */
  function setFocus(target, focus) {
    const value = focus.map((n) => Math.round(Math.min(100, Math.max(0, n))));
    target.ref.focus = value;
    for (const object of built().objects.filter((item) => item.follows && item.follows === target.node)) object.maskFocus = value;
    edits.focus.set(target.node, value);
  }

  /**
   * Option-drag inside a picture's box slides the picture inside it (the box
   * stays put), as for the talk portrait. A picture fills its box, so it slides
   * only the way it sticks out.
   */
  function startSlide(event, target) {
    event.preventDefault();
    event.stopPropagation();
    selected = target.key;
    const before = target.ref.focus ? [...target.ref.focus] : [50, 50];
    const [, , boxWidth, boxHeight] = rectOf(target);
    const k = scale();
    const startX = event.clientX;
    const startY = event.clientY;
    let frame = null;
    const onMove = (move) => {
      const dx = ((move.clientX - startX) / k / boxWidth) * 100;
      const dy = ((move.clientY - startY) / k / boxHeight) * 100;
      setFocus(target, [before[0] - dx, before[1] - dy]);
      if (!frame) frame = requestAnimationFrame(() => { frame = null; render(); drawOverlay(); });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const after = [...target.ref.focus ?? before];
      change(`Slide ${target.label}`, () => setFocus(target, after), () => setFocus(target, before));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // ---------------------------------------------------------------- portrait framing

  const isPortrait = (target) => target?.ref?.type === "slot" && target.ref.name === "portrait";

  /** The talking character's portraits note, which holds their framing. */
  function portraitNote() {
    const character = session.vault.notes[session.active];
    return session.vault.notes[character?.props.portraits] ?? null;
  }

  /**
   * The picture's placement inside the portrait box. A portrait with a
   * background (`## Backdrop`) has two layers: the character (`offset`, `zoom`)
   * and the background (`backdropFocus`, `backdropZoom`). A plain portrait has
   * one (`focus`, `zoom`).
   */
  const hasBackdrop = (note) => Boolean(note.blocks?.Backdrop);
  const LAYERS = {
    character: { position: "offset", zoom: "zoom", start: [0, 0], range: [-100, 100], sign: 1 },
    backdrop: { position: "backdropFocus", zoom: "backdropZoom", start: [50, 50], range: [0, 100], sign: -1 },
    picture: { position: "focus", zoom: "zoom", start: [50, 50], range: [0, 100], sign: -1 }
  };

  function framingOf(note, layer) {
    const keys = LAYERS[layer];
    const position = Array.isArray(note.props[keys.position]) ? note.props[keys.position].map(Number) : [...keys.start];
    return { position, zoom: Number(note.props[keys.zoom]) || 1 };
  }

  function setFraming(note, layer, { position, zoom }) {
    const keys = LAYERS[layer];
    const [low, high] = keys.range;
    note.props[keys.position] = position.map((value) => Math.round(Math.min(high, Math.max(low, value))));
    note.props[keys.zoom] = Math.round(Math.min(4, Math.max(0.3, zoom)) * 100) / 100;
    edits.props.set(note.path, { ...(edits.props.get(note.path) ?? {}), [keys.position]: note.props[keys.position], [keys.zoom]: note.props[keys.zoom] });
  }

  function reframe(note, layer, before, after) {
    change(`Place the ${layer}`, () => setFraming(note, layer, after), () => setFraming(note, layer, before));
  }

  /**
   * Option-drag inside the portrait box moves the character (or the one
   * picture); Option-Shift-drag moves the background. The box stays put.
   */
  function startPan(event, target) {
    const note = portraitNote();
    if (!note) return false;
    const layer = !hasBackdrop(note) ? "picture" : event.shiftKey ? "backdrop" : "character";
    event.preventDefault();
    event.stopPropagation();
    selected = target.key;
    const before = framingOf(note, layer);
    const [, , boxWidth, boxHeight] = rectOf(target);
    const k = scale();
    const startX = event.clientX;
    const startY = event.clientY;
    const sign = LAYERS[layer].sign;
    let frame = null;
    const onMove = (move) => {
      const dx = ((move.clientX - startX) / k / boxWidth) * 100;
      const dy = ((move.clientY - startY) / k / boxHeight) * 100;
      setFraming(note, layer, { position: [before.position[0] + sign * dx, before.position[1] + sign * dy], zoom: before.zoom });
      if (!frame) frame = requestAnimationFrame(() => { frame = null; render(); drawOverlay(); });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      reframe(note, layer, before, framingOf(note, layer));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return true;
  }

  function startDrag(event, target, mode) {
    if (mode === "move" && event.altKey && isPortrait(target) && startPan(event, target)) return;
    if (mode === "move" && event.altKey && isPicture(target)) return startSlide(event, target);
    event.preventDefault();
    event.stopPropagation();
    selected = target.key;
    const before = rectOf(target);
    const startX = event.clientX;
    const startY = event.clientY;
    const k = scale();
    const ratio = before[2] / before[3];
    let moved = false;
    let frame = null;
    const onMove = (move) => {
      const dx = (move.clientX - startX) / k;
      const dy = (move.clientY - startY) / k;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 1) return;
      moved = true;
      let [x, y, w, h] = before;
      if (mode === "move") {
        x += dx;
        y += dy;
      } else {
        if (mode.includes("w")) { x += dx; w -= dx; }
        if (mode.includes("e")) w += dx;
        if (mode.includes("n")) { y += dy; h -= dy; }
        if (mode.includes("s")) h += dy;
        if (move.shiftKey) {
          const newH = w / ratio;
          if (mode.includes("n")) y += h - newH;
          h = newH;
        }
        w = Math.max(2, w);
        h = Math.max(2, h);
      }
      if (!move.metaKey) [x, y, w, h] = snap(target, [x, y, w, h], mode);
      setRect(target, [x, y, w, h]);
      if (!frame) frame = requestAnimationFrame(() => { frame = null; render(); drawOverlay(); });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (moved) moveTo(target, before, rectOf(target));
      else clicked(target);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  /**
   * Snaps a box being dragged to the edges and middles of the other boxes
   * (and the screen) when it comes within a few pixels. Hold Cmd to drag freely.
   */
  function snap(target, rect, mode) {
    const reach = 6 / scale();
    const screen = built();
    const others = targets(target.lv ?? null).filter((other) => other.key !== target.key && !hidden.has(other.key)).map(rectOf);
    if (!target.lv && screen) others.push([0, 0, screen.width, screen.height]);
    const lines = (axis) => others.flatMap((box) => [box[axis], box[axis] + box[axis + 2] / 2, box[axis] + box[axis + 2]]);
    const out = [...rect];
    for (const axis of [0, 1]) {
      const near = lines(axis);
      const best = (value) => near.reduce((found, line) => (Math.abs(line - value) < Math.abs(found - value) ? line : found), Infinity);
      const low = mode === "move" || mode.includes(axis ? "n" : "w");
      const high = mode === "move" || mode.includes(axis ? "s" : "e");
      const start = out[axis];
      const end = out[axis] + out[axis + 2];
      const middle = start + out[axis + 2] / 2;
      if (mode === "move") {
        const shifts = [best(start) - start, best(middle) - middle, best(end) - end].filter((shift) => Math.abs(shift) <= reach);
        if (shifts.length) out[axis] += shifts.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
      } else {
        if (low && Math.abs(best(start) - start) <= reach) { out[axis + 2] += start - best(start); out[axis] = best(start); }
        if (high && Math.abs(best(end) - end) <= reach) out[axis + 2] = best(end) - out[axis];
      }
    }
    return out;
  }

  /** A click selects; a second click soon after opens a layer. (Redraws replace the
   * boxes, so the browser's own double-click never arrives.) */
  function clicked(target) {
    const now = performance.now();
    const double = lastClick.key === target.key && now - lastClick.at < 450;
    lastClick = { key: target.key, at: now };
    selected = target.key;
    if (double && target.canOpen) openLayer(target);
    else refresh();
  }

  function openLayer(target) {
    const lv = layerOf(target);
    if (!lv) return;
    level = lv;
    selected = null;
    refresh();
  }

  /**
   * What a click at this screen point picks: the smallest box under it, at
   * this level or inside any layer, so a click on the dog picks the dog, not
   * the layer it is in. Inside a layer, a click outside it looks at the screen.
   */
  function pick(x, y) {
    const under = (target) => {
      const [left, top, w, h] = rectOf(target);
      return x >= left && x <= left + w && y >= top && y <= top + h && !hidden.has(target.key);
    };
    let candidates = level ? targets(level).filter(under) : [];
    if (!candidates.length) {
      const top = targets(null);
      candidates = top.filter(under);
      for (const layer of top.filter((target) => target.canOpen && under(target))) {
        const lv = layerOf(layer);
        if (lv) candidates.push(...targets(lv).filter(under));
      }
    }
    // Things you can see right now come first (an exit that only shows when
    // the gate is open should not catch a click on the dog), then the smallest.
    const shown = (target) => {
      const { visible, clip, walk } = target.ref;
      const when = clip?.when ?? walk?.when;
      try {
        return evaluate(visible ?? null, session.world) && (when === undefined || evaluate(when, session.world));
      } catch {
        return true;
      }
    };
    const area = (target) => rectOf(target)[2] * rectOf(target)[3];
    return candidates.sort((left, right) => Number(shown(right)) - Number(shown(left)) || area(left) - area(right))[0] ?? null;
  }

  function closeLayer() {
    level = null;
    selected = null;
    refresh();
  }

  function setOrder(target, step) {
    const list = target.lv ? session.vault.notes[target.lv.uiId].blocks.Elements : built().elements;
    const from = list.indexOf(target.ref);
    const to = from + step;
    const floor = target.lv ? 0 : 1; // the scene picture stays at the back
    if (to < floor || to >= list.length) return;
    const swap = () => {
      const index = list.indexOf(target.ref);
      const other = index + step;
      [list[index], list[other]] = [list[other], list[index]];
      edits.order.set(target.lv ? `ui:${target.lv.uiId}` : "world", true);
    };
    const back = () => {
      const index = list.indexOf(target.ref);
      const other = index - step;
      [list[index], list[other]] = [list[other], list[index]];
    };
    change(`Order ${target.label}`, swap, back);
  }

  function toggleHidden(target) {
    if (hidden.has(target.key)) {
      target.ref.visible = hidden.get(target.key);
      if (target.ref.visible === undefined) delete target.ref.visible;
      hidden.delete(target.key);
    } else {
      hidden.set(target.key, target.ref.visible);
      target.ref.visible = false;
    }
    refresh();
  }

  function showAllHidden() {
    for (const target of targets()) if (hidden.has(target.key)) toggleHidden(target);
    hidden.clear();
  }

  // ---------------------------------------------------------------- adding parts and screens

  const slugOf = (text) => String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  /** A card id the canvas does not have yet. */
  function newNode(base) {
    made += 1;
    return `${slugOf(base) || "card"}-${Date.now().toString(36)}${made}`;
  }

  function pictureSize(url) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve([image.naturalWidth || 4, image.naturalHeight || 3]);
      image.onerror = () => resolve([4, 3]);
      image.src = url;
    });
  }

  /** Puts a new part on the screen (undoable); it is written to the canvas on Save. */
  function addPart(label, part) {
    change(label, () => {
      part.list.push(part.ref);
      edits.add.set(part.node, part);
      selected = part.key;
    }, () => {
      const index = part.list.indexOf(part.ref);
      if (index >= 0) part.list.splice(index, 1);
      edits.add.delete(part.node);
      edits.boxes.delete(part.key);
      if (selected === part.key) selected = null;
    });
  }

  /** A picture from the vault, a third of the screen wide, in the middle. */
  async function addPicture(picture) {
    const screen = built();
    if (!screen) return;
    const [width, height] = await pictureSize(picture.url);
    const w = Math.round(screen.width / 3);
    const h = Math.min(screen.height, Math.round((w * height) / width));
    const node = newNode(picture.name.replace(/\.\w+$/, ""));
    const ref = { type: "image", id: node, node, at: [Math.round((screen.width - w) / 2), Math.round((screen.height - h) / 2), w, h], src: picture.url, fit: "cover" };
    addPart(`Add ${picture.name}`, { node, file: picture.path, ref, field: "at", list: screen.elements, key: `el:${node}` });
  }

  /** An object, item or UI note, as a card in the middle of the screen. */
  function addThing(note) {
    const screen = built();
    if (!screen) return;
    const ui = note.type === "ui";
    const w = ui ? Math.round(screen.width / 2) : Math.round(screen.width / 8);
    const h = ui ? Math.round(screen.height / 2) : w;
    const at = [Math.round((screen.width - w) / 2), Math.round((screen.height - h) / 2), w, h];
    const node = newNode(note.id);
    const ref = ui ? { type: "ui", id: note.id, node, ui: note.id, at } : { id: note.id, rect: at, node, ...(note.type === "item" ? { item: true } : {}) };
    addPart(`Add ${note.id}`, { node, file: note.path, ref, field: ui ? "at" : "rect", list: ui ? screen.elements : screen.objects, key: ui ? `el:${node}` : `obj:${node}` });
  }

  /** Gives an object the shape of a picture on this screen (an arrow on the canvas). */
  function linkShape(object, image) {
    const before = { rect: object.rect, mask: object.mask, follows: object.follows, maskFocus: object.maskFocus };
    const key = `${object.node}>${image.node}`;
    change(`Click shape for ${object.id}`, () => {
      Object.assign(object, { rect: [...image.at], mask: image.src, follows: image.node, maskFocus: image.focus });
      edits.links.set(key, { from: object.node, to: image.node, label: "shape" });
      edits.unlinks.delete(key);
      edits.boxes.set(`obj:${object.node}`, objectTarget(object));
      selected = `el:${image.node}`;
    }, () => {
      Object.assign(object, before);
      edits.links.delete(key);
      selected = `obj:${object.node}`;
    });
  }

  /** Takes the click shape off a picture: its objects get their own boxes again. */
  function unlinkShape(image) {
    const objects = built().objects.filter((object) => object.follows === image.node);
    const before = objects.map((object) => ({ object, mask: object.mask, follows: object.follows, maskFocus: object.maskFocus }));
    change("Remove the click shape", () => {
      for (const object of objects) {
        const key = `${object.node}>${image.node}`;
        delete object.mask;
        delete object.follows;
        delete object.maskFocus;
        if (edits.links.has(key)) edits.links.delete(key);
        else edits.unlinks.set(key, { from: object.node, to: image.node });
      }
    }, () => {
      for (const { object, ...was } of before) {
        Object.assign(object, was);
        const key = `${object.node}>${image.node}`;
        if (edits.unlinks.has(key)) edits.unlinks.delete(key);
        else edits.links.set(key, { from: object.node, to: image.node, label: "shape" });
      }
    });
  }

  /** Takes a card off the screen (undoable). A picture's click shape goes with it. */
  function removePart(target) {
    const screen = built();
    const list = target.kind === "object" ? screen.objects : target.key.startsWith("exit:") ? screen.exits : screen.elements;
    const index = list.indexOf(target.ref);
    if (index < 0) return;
    const followers = screen.objects.filter((object) => object.follows && object.follows === target.node).map((object) => ({ object, mask: object.mask, follows: object.follows, maskFocus: object.maskFocus }));
    const wasAdded = edits.add.get(target.node);
    const box = edits.boxes.get(target.key);
    const exit = edits.exits.get(target.node);
    const card = edits.cards.get(target.node);
    change(`Remove ${target.label}`, () => {
      list.splice(list.indexOf(target.ref), 1);
      for (const { object } of followers) {
        delete object.mask;
        delete object.follows;
        delete object.maskFocus;
      }
      edits.boxes.delete(target.key);
      edits.focus.delete(target.node);
      if (wasAdded) edits.add.delete(target.node);
      else edits.remove.set(target.node, true);
      edits.exits.delete(target.node);
      edits.cards.delete(target.node);
      selected = null;
    }, () => {
      list.splice(Math.min(index, list.length), 0, target.ref);
      for (const { object, ...was } of followers) Object.assign(object, was);
      if (box) edits.boxes.set(target.key, box);
      if (wasAdded) edits.add.set(target.node, wasAdded);
      else edits.remove.delete(target.node);
      if (exit) edits.exits.set(target.node, exit);
      if (card) edits.cards.set(target.node, card);
      selected = target.key;
    });
  }

  /** A button to another screen (a text card with an arrow to that screen's group). */
  function addExit(to) {
    const screen = built();
    if (!screen) return;
    const label = `GO TO ${String(to).toUpperCase()} →`;
    const w = Math.round(screen.width / 4);
    const h = Math.round(screen.height / 12);
    const node = newNode(`exit-${to}`);
    const ref = { type: "button", id: node, node, at: [Math.round((screen.width - w) / 2), screen.height - h - 12, w, h], style: "exit", label, do: [`screen ${to}`], target: to, condition: null, edgeCondition: null, raw: label };
    const part = { node, text: label, ref, field: "at", list: screen.exits, key: `exit:${node}` };
    change(`Add an exit to ${to}`, () => {
      part.list.push(ref);
      edits.add.set(node, part);
      edits.exits.set(node, { node, to, condition: null });
      selected = part.key;
    }, () => {
      const index = part.list.indexOf(ref);
      if (index >= 0) part.list.splice(index, 1);
      edits.add.delete(node);
      edits.exits.delete(node);
      edits.boxes.delete(part.key);
      if (selected === part.key) selected = null;
    });
  }

  // ---------------------------------------------------------------- settings

  const plain = (body) => String(body).replace(/^#+\s*/gm, "").replace(/\*\*|__/g, "").trim();
  const copyEdits = (from) => Object.fromEntries(Object.entries(from).map(([key, map]) => [key, new Map(map)]));

  /**
   * Changes settings as one undoable step. `refs` are the objects the change
   * touches (an element, a note's props); they and the pending edits are
   * restored as they were on undo.
   */
  function changeSettings(label, refs, apply) {
    const snap = () => ({ refs: refs.map((ref) => ({ ref, copy: { ...ref } })), edits: copyEdits(edits) });
    const restore = (state) => {
      for (const { ref, copy } of state.refs) {
        for (const key of Object.keys(ref)) if (!(key in copy)) delete ref[key];
        Object.assign(ref, copy);
      }
      edits = copyEdits(state.edits);
    };
    const before = snap();
    apply();
    const after = snap();
    undo.push({ label, apply: () => restore(after), revert: () => restore(before) });
    redo = [];
    refresh();
  }

  // Several conditions (all must hold) are written one per line.
  const conditionOf = (visible) => [].concat(visible ?? []).join("\n");
  const conditionsIn = (text) => String(text).split("\n").map((line) => line.trim()).filter(Boolean);
  const toCondition = (text) => String(text).trim() || null;

  /** One labelled field: a text box (or a list) that calls `onSet` with its new value. */
  function field(label, value, onSet, { multiline = false, options = null, hint = "" } = {}) {
    let input;
    if (options) {
      input = el("select", {}, options.map(([optionValue, text]) => el("option", { value: optionValue, textContent: text, selected: optionValue === value })));
    } else {
      input = el(multiline ? "textarea" : "input", { value: value ?? "", rows: multiline ? 3 : undefined, placeholder: hint });
    }
    input.onchange = () => onSet(input.value);
    return el("label", { className: "editor-setting" }, [el("span", { textContent: label }), input]);
  }

  /** The settings for the selected part, by what it is. */
  function settingsFor(target) {
    const screen = built();
    const cardFields = (node) => edits.cards.get(node) ?? {};
    const setCard = (node, fields) => edits.cards.set(node, { ...cardFields(node), ...fields });
    const ref = target.ref;
    const rows = [];

    if (target.lv) return layerSettings(target);

    if (target.kind === "image") {
      const pictures = session.vault.pictures ?? [];
      const now = pictures.find((picture) => picture.url === ref.src);
      rows.push(field("Picture", now?.path ?? "", (path) => {
        const picture = pictures.find((item) => item.path === path);
        if (picture) changeSettings("Change the picture", [ref], () => { ref.src = picture.url; setCard(ref.node, { file: picture.path }); });
      }, { options: [...(now ? [] : [["", "(not in the list)"]]), ...pictures.map((picture) => [picture.path, picture.name])] }));
      rows.push(field("Show when", conditionOf(ref.visible), (text) => changeSettings("Change when it shows", [ref], () => {
        const condition = toCondition(conditionsIn(text)[0] ?? "");
        if (condition) ref.visible = [condition];
        else delete ref.visible;
        setCard(ref.node, { if: condition });
      }), { hint: "always, or a condition such as flag.gate-open" }));
    }

    if (target.kind === "text") {
      const write = (raw, condition) => setCard(ref.node, { text: `${condition ? `if ${condition}\n` : ""}${raw}` });
      rows.push(field("Text", ref.raw ?? ref.text, (text) => changeSettings("Change the text", [ref], () => {
        Object.assign(ref, { raw: text, text: plain(text) });
        write(text, ref.condition);
      }), { multiline: true }));
      rows.push(field("Show when", ref.condition ?? "", (text) => changeSettings("Change when it shows", [ref], () => {
        const condition = toCondition(text);
        ref.condition = condition;
        if (condition) ref.visible = [condition];
        else delete ref.visible;
        write(ref.raw ?? ref.text, condition);
      }), { hint: "always, or a condition" }));
    }

    if (target.kind === "exit") {
      const screens = Object.keys(session.vault.world ?? {}).filter((id) => id !== screenId());
      const visibleOf = () => [ref.condition, ref.edgeCondition].filter(Boolean);
      rows.push(field("Label", ref.raw ?? ref.label, (text) => changeSettings("Change the label", [ref], () => {
        Object.assign(ref, { raw: text, label: plain(text) });
        setCard(ref.node, { text: `${ref.condition ? `if ${ref.condition}\n` : ""}${text}` });
      }), { multiline: true }));
      rows.push(field("Goes to", ref.target, (to) => changeSettings("Change where it goes", [ref], () => {
        Object.assign(ref, { target: to, do: [`screen ${to}`] });
        edits.exits.set(ref.node, { node: ref.node, to, condition: ref.edgeCondition });
      }), { options: screens.map((id) => [id, id]) }));
      rows.push(field("Show when", ref.edgeCondition ?? "", (text) => changeSettings("Change when it shows", [ref], () => {
        ref.edgeCondition = toCondition(text);
        const visible = visibleOf();
        if (visible.length) ref.visible = visible;
        else delete ref.visible;
        edits.exits.set(ref.node, { node: ref.node, to: ref.target, condition: ref.edgeCondition });
      }), { hint: "always, or a condition" }));
    }

    if (target.kind === "object") {
      const note = session.vault.notes[ref.id];
      if (note) {
        const props = note.props;
        const setProp = (name, value) => edits.props.set(note.path, { ...(edits.props.get(note.path) ?? {}), [name]: value });
        rows.push(el("p", { className: "editor-hint", textContent: `${ref.id} is a note: these settings are the same on every screen it is on.` }));
        rows.push(field("Label", props.label ?? "", (text) => changeSettings("Change the label", [props], () => {
          const value = text.trim() || null;
          if (value) props.label = value;
          else delete props.label;
          setProp("label", value);
        }), { hint: props.name ?? ref.id }));
        rows.push(field("Key", props.key ?? "", (text) => changeSettings("Change the key", [props], () => {
          const value = text.trim().slice(0, 1).toUpperCase() || null;
          if (value) props.key = value;
          else delete props.key;
          setProp("key", value);
        }), { hint: "a keyboard shortcut, such as C" }));
        rows.push(field("Show when", conditionOf(props.visible), (text) => changeSettings("Change when it shows", [props], () => {
          const conditions = conditionsIn(text);
          if (conditions.length) props.visible = conditions;
          else delete props.visible;
          setProp("visible", conditions.length ? conditions : null);
        }), { multiline: true, hint: "always, or conditions (one per line, all must hold)" }));
        rows.push(field("On click", [].concat(props.use ?? []).join("\n"), (text) => changeSettings("Change what a click does", [props], () => {
          const effects = text.split("\n").map((line) => line.trim()).filter(Boolean);
          if (effects.length) props.use = effects;
          else delete props.use;
          setProp("use", effects.length ? effects : null);
        }), { multiline: true, hint: ref.item ? `item ${ref.id} held` : `open ${ref.id}` }));
      }
    }
    return rows;
  }

  /** A new screen's note: its title now; objective and overlay are set in Screen settings. */
  function screenNoteText(label, title) {
    return `---\ntype: screen\ntitle: ${JSON.stringify(title || label)}\nwidth: 640\nheight: 360\n---\n\n# ${title || label}\n\nMade in the screen editor. Where things sit is the \`${label}\` group on [[World.canvas]]. Its title, objective and overlay are in the editor's Screen settings (Cmd+E, nothing selected).\n`;
  }

  /** Makes a note for a screen that has none (an older screen), and loads it. */
  async function makeScreenNote() {
    const label = screenId();
    if (editCount()) {
      status = "Save or undo your changes first.";
      return drawPanel();
    }
    const result = await host?.saveEdits?.({ canvases: {}, notes: {}, create: { [`screens/${label}/${label}.md`]: screenNoteText(label, label) }, since: since() });
    status = !result ? "Saving works in the desktop app (npm run app)." : result.error ? `Could not make the note: ${result.error}` : `Made screens/${label}/${label}.md.`;
    if (result && !result.error) await reloadVault?.();
    refresh();
  }

  /** Title, objective and overlay of the screen you are on (its screen note). */
  function screenSettings() {
    const note = session.vault.notes[screenId()];
    if (note?.type !== "screen") {
      return [el("p", { className: "editor-hint", textContent: "This screen has no screen note, so it has no title, objective or overlay." }), button("Make a screen note", makeScreenNote)];
    }
    const props = note.props;
    const setProp = (name, value) => edits.props.set(note.path, { ...(edits.props.get(note.path) ?? {}), [name]: value });
    const text = (name, label, hint) => field(label, props[name] ?? "", (value) => changeSettings(`Change the ${label.toLowerCase()}`, [props], () => {
      const clean = value.trim() || null;
      if (clean) props[name] = clean;
      else delete props[name];
      setProp(name, clean);
    }), { hint });
    const overlays = session.notesOfType("ui").map((ui) => ui.id);
    return [
      text("title", "Title", screenId()),
      text("objective", "Objective", "what the player should do here"),
      field("Overlay", props.ui ?? "", (value) => changeSettings("Change the overlay", [props], () => {
        if (value) props.ui = value;
        else delete props.ui;
        // In the note it is a link; the game reads it by name.
        setProp("ui", value ? `[[${value}]]` : null);
      }), { options: [["", "(none)"], ...overlays.map((id) => [id, id])] }),
      el("p", { className: "editor-hint", textContent: "The overlay is a UI note drawn over the whole screen, such as a frame with the title and objective." })
    ];
  }

  // Settings with their own fields; anything else is a text box (text, a
  // number, or JSON). `def` is the engine's default: a field left at it is
  // not written.
  const CONDITION = { kind: "conditions", hint: "always, or conditions (one per line, all must hold)" };
  const GROUPS = {
    swing: { types: null, title: "Swing (a gate leaf opening)", start: () => ({ when: ["flag.gate-open"], hinge: "left", to: 0.15 }), fields: {
      when: { ...CONDITION, label: "Swings while", hint: "a condition such as flag.gate-open" },
      hinge: { kind: "choice", label: "Hinge", options: ["left", "right"], def: "left" },
      to: { kind: "number", label: "Opens to (share of its width)", def: 0.15, step: 0.01, min: 0, max: 1 },
      seconds: { kind: "number", label: "Seconds", def: 1.5, step: 0.1, min: 0 },
      steps: { kind: "number", label: "Held steps", def: 6, step: 1, min: 1 }
    } },
    walk: { types: null, title: "Walk (moves in a straight line)", start: (ref) => ({ to: [Math.round(ref.at[0] + 100), Math.round(ref.at[1])] }), fields: {
      when: { ...CONDITION, label: "Walks while", hint: "always" },
      to: { kind: "point", label: "Walks to (x, y)" },
      seconds: { kind: "number", label: "Seconds each way", def: 10, step: 0.5, min: 0 },
      fps: { kind: "number", label: "Steps a second", def: 8, step: 1, min: 1 },
      back: { kind: "check", label: "Comes back", def: true },
      loop: { kind: "check", label: "Repeats", def: false }
    } },
    clip: { types: ["image"], title: "Clip (plays numbered frames)", start: () => ({ frames: 8, fps: 8 }), fields: {
      when: { ...CONDITION, label: "Plays while", hint: "always" },
      frames: { kind: "number", label: "Frames", def: 1, step: 1, min: 1 },
      fps: { kind: "number", label: "Frames a second", def: 8, step: 1, min: 1 },
      wait: { kind: "number", label: "Wait first (seconds)", def: 0, step: 0.5, min: 0 },
      gap: { kind: "number", label: "Hidden between (seconds)", def: 0, step: 0.5, min: 0 },
      back: { kind: "check", label: "Plays back, mirrored", def: true },
      loop: { kind: "check", label: "Repeats", def: false }
    } }
  };
  const SINGLES = {
    visible: { ...CONDITION, label: "Show when" },
    opacity: { kind: "range", label: "Opacity", def: 1 },
    shade: { kind: "range", label: "Shade (0 black, 1 as drawn)", def: 1 },
    mirror: { kind: "check", label: "Mirror", def: false },
    rotate: { kind: "number", label: "Rotate (degrees)", def: 0, step: 1 }
  };

  /** One field for a setting of a known kind; `onSet` gets the new value (undefined: remove it). */
  function typedField(spec, value, onSet) {
    const wrap = (input) => el("label", { className: `editor-setting${spec.kind === "check" ? " check" : ""}` }, [el("span", { textContent: spec.label }), input]);
    if (spec.kind === "conditions") {
      const input = el("textarea", { value: [].concat(value ?? []).join("\n"), rows: 2, placeholder: spec.hint });
      input.onchange = () => {
        const list = input.value.split("\n").map((line) => line.trim()).filter(Boolean);
        onSet(list.length ? list : undefined);
      };
      return wrap(input);
    }
    if (spec.kind === "choice") {
      const input = el("select", {}, spec.options.map((option) => el("option", { value: option, textContent: option, selected: option === (value ?? spec.def) })));
      input.onchange = () => onSet(input.value === spec.def ? undefined : input.value);
      return wrap(input);
    }
    if (spec.kind === "check") {
      const input = el("input", { type: "checkbox", checked: value ?? spec.def });
      input.onchange = () => onSet(input.checked === spec.def ? undefined : input.checked);
      return wrap(input);
    }
    if (spec.kind === "range") {
      const shown = el("output", { textContent: String(value ?? spec.def) });
      const input = el("input", { type: "range", min: 0, max: 1, step: 0.05, value: value ?? spec.def });
      input.oninput = () => (shown.textContent = input.value);
      input.onchange = () => onSet(Number(input.value) === spec.def ? undefined : Number(input.value));
      return el("label", { className: "editor-setting" }, [el("span", { textContent: spec.label }), el("div", { className: "editor-range" }, [input, shown])]);
    }
    if (spec.kind === "point") {
      const [x, y] = Array.isArray(value) ? value : [0, 0];
      const inputs = [x, y].map((n) => el("input", { type: "number", value: n, step: 1 }));
      for (const input of inputs) input.onchange = () => onSet(inputs.map((item) => Math.round(Number(item.value) || 0)));
      return el("label", { className: "editor-setting" }, [el("span", { textContent: spec.label }), el("div", { className: "editor-point" }, inputs)]);
    }
    const input = el("input", { type: "number", value: value ?? spec.def, step: spec.step ?? 1, min: spec.min, max: spec.max });
    input.onchange = () => {
      const number = Number(input.value);
      onSet(input.value === "" || number === spec.def ? undefined : number);
    };
    return wrap(input);
  }

  /** A part inside a UI layer: proper fields for what the engine knows, text for the rest. */
  function layerSettings(target) {
    const ref = target.ref;
    const key = `${target.lv.uiId}:${original.get(ref)}`;
    const rows = [];
    const setValue = (name, value) => changeSettings(`Change ${name}`, [ref], () => {
      if (value === null || value === undefined) delete ref[name];
      else ref[name] = value;
      const entry = edits.settings.get(key) ?? { uiId: target.lv.uiId, index: original.get(ref), values: {} };
      edits.settings.set(key, { ...entry, values: { ...entry.values, [name]: value ?? null } });
    });

    for (const [name, spec] of Object.entries(SINGLES)) {
      if (name === "mirror" && ref.swing) continue;
      rows.push(typedField(spec, ref[name], (value) => setValue(name, value)));
    }
    for (const [name, group] of Object.entries(GROUPS)) {
      if (group.types && !group.types.includes(ref.type)) continue;
      const current = ref[name];
      if (!current || typeof current !== "object") {
        rows.push(button(`＋ ${group.title}`, () => setValue(name, group.start(ref)), { className: "editor-add-group" }));
        continue;
      }
      const setPart = (part, value) => {
        const next = { ...current };
        if (value === undefined) delete next[part];
        else next[part] = value;
        setValue(name, next);
      };
      rows.push(el("fieldset", { className: "editor-group" }, [
        el("legend", { textContent: group.title }),
        ...Object.entries(group.fields).map(([part, spec]) => typedField(spec, current[part], (value) => setPart(part, value))),
        button(`Remove ${name}`, () => setValue(name, undefined), { className: "danger" })
      ]));
    }
    if (!ref.id && (ref.swing || ref.walk || ref.clip)) rows.push(el("p", { className: "editor-hint warn", textContent: "Swing, walk and clip need an id (below), so they keep going across redraws." }));

    // Everything else, as text: a number, text, or JSON for lists.
    const known = new Set(["type", "at", "children", ...Object.keys(SINGLES), ...Object.keys(GROUPS)]);
    const show = (value) => (typeof value === "string" ? value : JSON.stringify(value));
    const read = (text) => {
      const trimmed = text.trim();
      if (trimmed === "") return undefined;
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    };
    for (const name of Object.keys(ref).filter((name) => !known.has(name))) rows.push(field(name, show(ref[name]), (text) => setValue(name, read(text))));
    const offered = [...(ELEMENT_PROPS[ref.type] ?? []), "id", "style"].filter((item) => !known.has(item) && !(item in ref));
    const name = el("input", { placeholder: "setting" });
    name.setAttribute("list", "editor-known-settings");
    const value = el("input", { placeholder: "value" });
    rows.push(
      el("datalist", { id: "editor-known-settings" }, offered.map((item) => el("option", { value: item }))),
      el("div", { className: "editor-setting-new" }, [name, value, button("Add", () => name.value.trim() && setValue(name.value.trim(), read(value.value)))]),
      el("p", { className: "editor-hint", textContent: "Empty a text value to remove it. Lists are JSON, such as [\"#000\", \"#fff\"]." })
    );
    return rows;
  }

  /** Makes a new screen on the world canvas from a picture, saves it, and goes there. */
  async function makeScreen(picture) {
    const label = slugOf(screenName);
    const fail = (text) => { status = text; drawPanel(); };
    if (!label) return fail("Give the new screen a name first.");
    if (session.vault.world?.[label] || session.vault.notes[label]) return fail(`There is already a screen or note named ${label}.`);
    if (editCount()) return fail("Save or undo your changes first, then make the screen.");
    if (!host?.saveEdits) return fail("Saving works in the desktop app (npm run app).");
    const [width, height] = await pictureSize(picture.url);
    const worldPath = session.vault.worldPath ?? "World.canvas";
    const title = screenName.trim();
    const result = await host.saveEdits({
      canvases: { [worldPath]: { boxes: [], screens: [{ label, file: picture.path, width, height }] } },
      notes: {},
      create: { [`screens/${label}/${label}.md`]: screenNoteText(label, title) },
      since: since()
    });
    if (result.error) return fail(`Could not make the screen: ${result.error}`);
    if (result.conflicts.length) return fail(`${result.conflicts.join(", ")} changed on disk. Reload the game, then try again.`);
    await reloadVault?.();
    session.runEffects([`screen ${label}`], "editor");
    adding = null;
    screenName = "";
    selected = null;
    level = null;
    status = `Made screen ${label} on ${worldPath}. Add parts to it, and an exit to it from another screen.`;
    refresh();
  }

  /** The Add section: pictures, things (objects, items, UI), or a new screen. */
  function addSection() {
    const tabs = el("div", { className: "editor-add-tabs" }, [
      ["picture", "＋ Picture"],
      ["thing", "＋ Thing"],
      ["exit", "＋ Exit"],
      ["screen", "＋ New screen"]
    ].map(([mode, text]) => button(text, () => { adding = adding === mode ? null : mode; drawPanel(); }, { className: adding === mode ? "on" : "" })));
    if (!adding) return el("div", { className: "editor-add" }, [tabs]);

    const find = el("input", { type: "search", placeholder: "Search", value: search });
    find.oninput = () => {
      search = find.value;
      drawPanel();
      const again = panel.querySelector(".editor-add input[type=search]");
      again?.focus();
      again?.setSelectionRange(search.length, search.length);
    };
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (text) => words.every((word) => text.toLowerCase().includes(word));
    const parts = [tabs];

    if (adding === "screen") {
      const name = el("input", { type: "text", placeholder: "Screen name, such as home", value: screenName });
      name.oninput = () => (screenName = name.value);
      parts.push(name, el("p", { className: "editor-hint", textContent: "Then click the picture for its background. The name is also its title; a screen note is made with it." }));
    }
    if (adding === "exit") {
      const screens = Object.keys(session.vault.world ?? {}).filter((id) => id !== screenId() && matches(id));
      parts.push(el("p", { className: "editor-hint", textContent: "A button that goes to another screen. Choose where it goes:" }), el("ul", { className: "editor-things" }, screens.map((id) => el("li", {}, [button(`→ ${id}`, () => addExit(id))]))));
    } else if (adding === "thing") {
      const here = new Set([...(built()?.objects ?? []).map((object) => object.id), ...(built()?.elements ?? []).filter((element) => element.type === "ui").map((element) => element.ui)]);
      const things = ["object", "item", "ui"].flatMap((type) => session.notesOfType(type).map((note) => ({ ...note, type })))
        .filter((note) => !here.has(note.id) && matches(`${note.id} ${note.type}`));
      parts.push(find, el("ul", { className: "editor-things" }, things.length
        ? things.map((note) => el("li", {}, [button(`${note.id}`, () => addThing(note)), el("span", { textContent: note.type })]))
        : [el("li", { textContent: "Nothing to add: every object, item and UI is on this screen." })]));
    } else {
      const pictures = (session.vault.pictures ?? []).filter((picture) => matches(picture.path));
      parts.push(find, el("div", { className: "editor-pictures" }, pictures.slice(0, 60).map((picture) =>
        el("button", { title: picture.path, onclick: () => (adding === "screen" ? makeScreen(picture) : addPicture(picture)) }, [
          el("img", { src: picture.url, alt: "", loading: "lazy" }),
          el("span", { textContent: picture.name })
        ]))));
      if (pictures.length > 60) parts.push(el("p", { className: "editor-hint", textContent: `${pictures.length - 60} more: search to find them.` }));
    }
    return el("div", { className: "editor-add" }, parts);
  }

  // ---------------------------------------------------------------- panel

  const el = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };
  const button = (text, onClick, extra = {}) => el("button", { textContent: text, onclick: onClick, ...extra });

  function drawPanel() {
    panel.hidden = !on;
    if (!on) return;
    const list = targets();
    const current = list.find((target) => target.key === selected);
    const pending = editCount();

    const crumbs = el("div", { className: "editor-crumbs" }, level
      ? [button("‹ Screen", closeLayer), el("span", { textContent: ` ▸ ${level.label}` })]
      : [el("span", { textContent: "Screen:" }), screenPicker()]);

    let fields = el("div", { className: "editor-fields" }, [
      el("p", { className: "editor-hint", textContent: "Click a box to select it. Double-click a layer to edit inside it." }),
      ...(level ? [] : [el("h3", { textContent: "Screen settings" }), el("div", { className: "editor-settings" }, screenSettings())])
    ]);
    if (current) {
      const at = current.ref[current.field].map(round);
      const inputs = ["x", "y", "w", "h"].map((name, index) => {
        const input = el("input", { type: "number", value: at[index], title: name });
        input.onchange = () => {
          const before = rectOf(current);
          const units = current.ref[current.field].map(Number);
          units[index] = Number(input.value);
          const saved = current.ref[current.field];
          current.ref[current.field] = units;
          const after = rectOf(current);
          current.ref[current.field] = saved;
          moveTo(current, before, after);
        };
        return el("label", {}, [el("span", { textContent: name }), input]);
      });
      fields = el("div", { className: "editor-fields" }, [
        el("strong", { textContent: current.label }),
        el("div", { className: "editor-xywh" }, inputs),
        ...(current.canOpen ? [button("Edit inside ▸", () => openLayer(current))] : []),
        ...(isPortrait(current) && portraitNote() ? [framingFields(portraitNote())] : []),
        ...(isPicture(current) ? [el("p", { className: "editor-hint", textContent: "Option-drag inside the box to slide the picture in it." })] : []),
        ...(isPicture(current) && built().objects.some((object) => object.follows === current.node) ? [button("Remove the click shape", () => unlinkShape(current.ref))] : []),
        ...(current.kind === "object" ? [shapePicker(current.ref)] : []),
        ...(() => {
          const rows = settingsFor(current);
          return rows.length ? [el("h3", { textContent: "Settings" }), el("div", { className: "editor-settings" }, rows)] : [];
        })(),
        ...(!current.lv && current.node && !current.key.startsWith("panel:") ? [button("Remove from screen", () => removePart(current), { className: "danger" })] : [])
      ]);
    }

    const layers = el("ol", { className: "editor-layers", reversed: true }, [...list].reverse().map((target) => el("li", { className: target.key === selected ? "selected" : "" }, [
      button(hidden.has(target.key) ? "◌" : "●", () => toggleHidden(target), { title: "Show or hide while editing (not saved)", className: "eye" }),
      el("span", { textContent: target.label, onclick: () => clicked(target) }),
      ...(target.canOpen ? [button("▸", () => openLayer(target), { title: "Edit inside" })] : []),
      ...(target.orderable ? [button("▲", () => setOrder(target, 1), { title: "Bring forward" }), button("▼", () => setOrder(target, -1), { title: "Send back" })] : [])
    ])));

    const world = session.world;
    const switches = [
      ...Object.keys(world.flag ?? {}).map((flag) => [`flag.${flag}`, () => world.flag[flag], (value) => (world.flag[flag] = value)]),
      ...session.notesOfType("object").map((object) => [`open.${object.id}`, () => Boolean(world.open?.[object.id]), (value) => (world.open = { ...world.open, [object.id]: value })]),
      ...Object.keys(world.item ?? {}).map((item) => [`item.${item} shown`, () => world.item[item] === "shown", (value) => (world.item[item] = value ? "shown" : "held")])
    ].map(([label, get, set]) => {
      const box = el("input", { type: "checkbox", checked: get() });
      box.onchange = () => { set(box.checked); refresh(); };
      return el("label", { className: "editor-switch" }, [box, el("span", { textContent: label })]);
    });

    panel.replaceChildren(
      el("h2", { textContent: "Edit screen" }),
      crumbs,
      fields,
      el("h3", { textContent: "Add" }),
      level ? el("p", { className: "editor-hint", textContent: "Go back to the screen to add parts." }) : addSection(),
      el("h3", { textContent: "Layers (front at the top)" }),
      layers,
      el("h3", { textContent: "Preview" }),
      el("div", { className: "editor-switches" }, switches),
      el("div", { className: "editor-actions" }, [
        button("Undo", doUndo, { disabled: !undo.length }),
        button("Redo", doRedo, { disabled: !redo.length }),
        button(pending ? `Save (${pending})` : "Saved", () => save(), { disabled: !pending, className: "primary" }),
        button("Done", () => toggle(false))
      ]),
      el("p", { className: `editor-status${stale ? " warn" : ""}`, textContent: status || (stale ? "The vault changed on disk while you were editing. Save will ask before overwriting." : "Cmd+S saves · Cmd+Z undoes · Esc goes back · arrows nudge (Shift: 10)") })
    );
  }

  /** A list of this screen's pictures; choosing one gives the object its shape. */
  function shapePicker(object) {
    const images = built().elements.filter((element) => element.type === "image" && element.node && element.id !== `${screenId()}-picture`);
    const choose = el("select", {}, [
      el("option", { value: "", textContent: images.length ? "Click shape from a picture…" : "No pictures on this screen to take a shape from" }),
      ...images.map((image) => el("option", { value: image.node, textContent: image.id }))
    ]);
    choose.onchange = () => {
      const image = images.find((item) => item.node === choose.value);
      if (image) linkShape(object, image);
    };
    return choose;
  }

  /** Goes to another screen to edit it (after saving or undoing changes here). */
  function screenPicker() {
    const choose = el("select", { title: "Edit another screen" }, Object.keys(session.vault.world ?? {}).map((id) => el("option", { value: id, textContent: id, selected: id === screenId() })));
    choose.onchange = () => {
      if (editCount()) {
        status = "Save or undo your changes first, then change screen.";
        return drawPanel();
      }
      session.runEffects([`screen ${choose.value}`], "editor");
      selected = null;
      adding = null;
      status = "";
      refresh();
    };
    return choose;
  }

  /** Number fields for each portrait layer, for this character. */
  function framingFields(note) {
    const name = session.vault.notes[session.active]?.props.name ?? "This character";
    const group = (layer, title) => {
      const { position, zoom } = framingOf(note, layer);
      const field = (label, value, step, apply) => {
        const input = el("input", { type: "number", value, step, title: label });
        input.onchange = () => {
          const before = framingOf(note, layer);
          reframe(note, layer, before, apply({ position: [...before.position], zoom: before.zoom }, Number(input.value)));
        };
        return el("label", {}, [el("span", { textContent: label }), input]);
      };
      return el("div", {}, [
        el("p", { className: "editor-hint", textContent: title }),
        el("div", { className: "editor-xywh" }, [
          field("x %", position[0], 1, (framing, value) => ({ ...framing, position: [value, framing.position[1]] })),
          field("y %", position[1], 1, (framing, value) => ({ ...framing, position: [framing.position[0], value] })),
          field("zoom", zoom, 0.05, (framing, value) => ({ ...framing, zoom: value }))
        ])
      ]);
    };
    if (!hasBackdrop(note)) return el("div", { className: "editor-framing" }, [group("picture", `${name}'s picture: Option-drag inside the box to slide it.`)]);
    return el("div", { className: "editor-framing" }, [
      group("character", `${name}: Option-drag to move.`),
      group("backdrop", "Background: Option-Shift-drag to move.")
    ]);
  }

  function doUndo() {
    const step = undo.pop();
    if (!step) return;
    step.revert();
    redo.push(step);
    refresh();
  }

  function doRedo() {
    const step = redo.pop();
    if (!step) return;
    step.apply();
    undo.push(step);
    refresh();
  }

  // ---------------------------------------------------------------- save

  function collect() {
    const screen = built();
    const vault = session.vault;
    const canvases = {};
    const notes = {};
    const worldPath = vault.worldPath ?? "World.canvas";
    const unit = screen.frame?.unit ?? 1;
    const ox = screen.frame?.x ?? 0;
    const oy = screen.frame?.y ?? 0;
    for (const target of edits.boxes.values()) {
      if (target.key.startsWith("panel:")) {
        const path = vault.notes[target.objectId].path;
        (notes[path] ??= { boxes: [] }).props = { ...(notes[path]?.props ?? {}), panel: target.ref.panel.map(round) };
      } else if (target.key.startsWith("ui:")) {
        const [, uiId, index] = target.key.split(":");
        const path = vault.notes[uiId].path;
        (notes[path] ??= { boxes: [] }).boxes.push({ index: Number(index), at: target.ref.at.map(round) });
      } else {
        const [x, y, w, h] = target.ref[target.field];
        (canvases[worldPath] ??= { boxes: [] }).boxes.push({ node: target.node, x: ox + x * unit, y: oy + y * unit, width: w * unit, height: h * unit });
      }
    }
    // New cards first (the save adds them before it moves boxes), then arrows.
    for (const part of edits.add.values()) {
      const [x, y, w, h] = part.ref[part.field];
      const card = part.text != null ? { text: part.text } : { file: part.file };
      (canvases[worldPath] ??= { boxes: [] }).add = [...(canvases[worldPath].add ?? []), { node: part.node, ...card, x: ox + x * unit, y: oy + y * unit, width: w * unit, height: h * unit }];
    }
    if (edits.links.size) (canvases[worldPath] ??= { boxes: [] }).links = [...edits.links.values()];
    if (edits.unlinks.size) (canvases[worldPath] ??= { boxes: [] }).unlinks = [...edits.unlinks.values()];
    if (edits.remove.size) (canvases[worldPath] ??= { boxes: [] }).remove = [...edits.remove.keys()];
    if (edits.cards.size) (canvases[worldPath] ??= { boxes: [] }).cards = [...edits.cards.entries()].map(([node, fields]) => ({ node, ...fields }));
    if (edits.exits.size) (canvases[worldPath] ??= { boxes: [] }).exits = [...edits.exits.values()];
    for (const { uiId, index, values } of edits.settings.values()) {
      const path = vault.notes[uiId].path;
      (notes[path] ??= { boxes: [] }).settings = [...(notes[path].settings ?? []), { index, values }];
    }
    for (const [node, value] of edits.focus) {
      (canvases[worldPath] ??= { boxes: [] }).focus = [...(canvases[worldPath].focus ?? []), { node, value }];
    }
    for (const [path, props] of edits.props) {
      (notes[path] ??= { boxes: [] }).props = { ...(notes[path]?.props ?? {}), ...props };
    }
    for (const key of edits.order.keys()) {
      if (key === "world") {
        (canvases[worldPath] ??= { boxes: [] }).order = screen.elements.map((element) => element.node).filter(Boolean);
      } else {
        const uiId = key.slice(3);
        const note = vault.notes[uiId];
        (notes[note.path] ??= { boxes: [] }).order = note.blocks.Elements.map((element) => original.get(element));
      }
    }
    return { canvases, notes, since: since() };
  }

  /** When this copy of the vault was loaded (or last saved by us): later disk changes are someone else's. */
  function since() {
    const vault = session.vault;
    return lastSave && lastSave > vault.builtAt ? lastSave : vault.builtAt;
  }

  async function save(force = false) {
    if (!host?.saveEdits) {
      status = "Saving works in the desktop app (npm run app).";
      return drawPanel();
    }
    const result = await host.saveEdits({ ...collect(), force });
    if (result.error) {
      status = `Could not save: ${result.error}`;
    } else if (result.conflicts.length) {
      status = `${result.conflicts.join(", ")} changed on disk since you started editing.`;
      drawPanel();
      panel.querySelector(".editor-actions").append(button("Save anyway", () => save(true), { className: "danger" }));
      return;
    } else {
      status = `Saved ${result.saved.join(", ")}.`;
      lastSave = new Date().toISOString();
      // New cards and arrows: load the rebuilt world, so the screen is exactly what was saved.
      const rebuilt = edits.add.size || edits.links.size || edits.unlinks.size || edits.remove.size || edits.exits.size;
      if (rebuilt && reloadVault) {
        await reloadVault();
        lastSave = null;
      }
      edits = freshEdits();
      undo = [];
      redo = [];
      stale = false;
    }
    drawPanel();
  }

  // ---------------------------------------------------------------- on / off

  function toggle(value = !on) {
    if (value === on) return;
    if (!value && editCount() && !confirm("Leave without saving? Your edits stay on screen until the game reloads.")) return;
    on = value;
    session.paused = on;
    setEditorPreview(on);
    document.body.classList.toggle("editing", on);
    if (!on) {
      showAllHidden();
      level = null;
      selected = null;
      status = "";
    }
    refresh();
  }

  window.addEventListener("keydown", (event) => {
    if (!on || event.target.closest?.("input, textarea, select")) return;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === "s") { event.preventDefault(); save(); return; }
    if (meta && event.key.toLowerCase() === "z") { event.preventDefault(); (event.shiftKey ? doRedo : doUndo)(); return; }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (selected) { selected = null; refresh(); } else if (level) closeLayer(); else toggle(false);
      return;
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const target = targets().find((item) => item.key === selected);
    if (arrows[event.key] && target) {
      event.preventDefault();
      event.stopPropagation();
      const step = event.shiftKey ? 10 : 1;
      const before = rectOf(target);
      const unitsPerPixel = target.lv ? target.lv.box[2] / target.lv.width : 1;
      const [dx, dy] = arrows[event.key];
      moveTo(target, before, [before[0] + dx * step * unitsPerPixel, before[1] + dy * step * unitsPerPixel, before[2], before[3]]);
    }
  }, true);
  window.addEventListener("resize", () => on && drawOverlay());
  window.addEventListener("ui-mask-ready", () => on && drawOverlay());
  overlay.addEventListener("pointerdown", (event) => {
    if (event.target.classList.contains("editor-handle")) return;
    const bounds = overlay.getBoundingClientRect();
    const k = scale();
    const target = pick((event.clientX - bounds.left) / k, (event.clientY - bounds.top) / k);
    if (!target) {
      selected = null;
      if (level) level = null;
      return refresh();
    }
    // A part inside a layer opens that layer, so the list and Esc follow it.
    if ((target.lv?.uiId ?? null) !== (level?.uiId ?? null)) level = target.lv ?? null;
    startDrag(event, target, "move");
  });

  return {
    get on() { return on; },
    get dirty() { return BooleaneditCount(); },
    panelWidth: () => (on ? PANEL_WIDTH : 0),
    toggle,
    /** The vault was rebuilt on disk while editing with unsaved changes. */
    markStale() { stale = true; drawPanel(); },
    /** Redraw the boxes after the game redrew (a new vault, a resize). */
    redraw() { if (on) { drawOverlay(); drawPanel(); } }
  };
}
