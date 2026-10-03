// The screen editor (Cmd+E in the desktop app; ENGINE_SPEC.md 12.7). It draws
// boxes over the real game screen: drag to move, drag a corner to resize
// (Shift keeps the shape), arrow keys nudge. Double-click a layer (a UI note
// such as the gate front) to edit the parts inside it. The layer list changes
// the drawing order; the switches show the screen with a flag on or off.
// Changes show at once and are saved into the vault with Save (Cmd+S): card
// boxes and order on the world canvas, element boxes and order in UI notes.

import { evaluate } from "/js/engine/conditions.js";
import { pictureShape, setEditorPreview } from "/js/engine/ui.js";

const PANEL_WIDTH = 320;
const round = (value) => Math.round(value);
const clone = (rect) => rect.map(Number);

export function createEditor({ session, stage, render, host }) {
  let on = false;
  let level = null; // null: the screen; else { uiId, box } (a UI layer opened for editing)
  let selected = null;
  let undo = [];
  let redo = [];
  let edits = { boxes: new Map(), order: new Map(), props: new Map(), focus: new Map() };
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
    const pending = edits.boxes.size + edits.order.size + edits.props.size + edits.focus.size;

    const crumbs = el("div", { className: "editor-crumbs" }, level
      ? [button("‹ Screen", closeLayer), el("span", { textContent: ` ▸ ${level.label}` })]
      : [el("span", { textContent: `Screen: ${screenId()}` })]);

    let fields = el("p", { className: "editor-hint", textContent: "Click a box to select it. Double-click a layer to edit inside it." });
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
        ...(isPicture(current) ? [el("p", { className: "editor-hint", textContent: "Option-drag inside the box to slide the picture in it." })] : [])
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
    const since = lastSave && lastSave > vault.builtAt ? lastSave : vault.builtAt;
    return { canvases, notes, since };
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
      edits = { boxes: new Map(), order: new Map(), props: new Map(), focus: new Map() };
      undo = [];
      redo = [];
      stale = false;
    }
    drawPanel();
  }

  // ---------------------------------------------------------------- on / off

  function toggle(value = !on) {
    if (value === on) return;
    if (!value && (edits.boxes.size || edits.order.size || edits.props.size || edits.focus.size) && !confirm("Leave without saving? Your edits stay on screen until the game reloads.")) return;
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
    if (!on || event.target.closest?.("input, textarea")) return;
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
    get dirty() { return Boolean(edits.boxes.size || edits.order.size || edits.props.size || edits.focus.size); },
    panelWidth: () => (on ? PANEL_WIDTH : 0),
    toggle,
    /** The vault was rebuilt on disk while editing with unsaved changes. */
    markStale() { stale = true; drawPanel(); },
    /** Redraw the boxes after the game redrew (a new vault, a resize). */
    redraw() { if (on) { drawOverlay(); drawPanel(); } }
  };
}
