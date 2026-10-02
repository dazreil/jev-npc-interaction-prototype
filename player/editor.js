// The screen editor (Cmd+E in the desktop app; ENGINE_SPEC.md 12.7). It draws
// boxes over the real game screen: drag to move, drag a corner to resize
// (Shift keeps the shape), arrow keys nudge. Double-click a layer (a UI note
// such as the gate front) to edit the parts inside it. The layer list changes
// the drawing order; the switches show the screen with a flag on or off.
// Changes show at once and are saved into the vault with Save (Cmd+S): card
// boxes and order on the world canvas, element boxes and order in UI notes.

import { evaluate } from "/js/engine/conditions.js";
import { setEditorPreview } from "/js/engine/ui.js";

const PANEL_WIDTH = 320;
const round = (value) => Math.round(value);
const clone = (rect) => rect.map(Number);

export function createEditor({ session, stage, render, host }) {
  let on = false;
  let level = null; // null: the screen; else { uiId, box } (a UI layer opened for editing)
  let selected = null;
  let undo = [];
  let redo = [];
  let edits = { boxes: new Map(), order: new Map() };
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
    if (!note?.blocks.Elements) return null;
    return { uiId: target.ref.ui, box: clone(target.ref.at), width: Number(note.props.width) || target.ref.at[2], height: Number(note.props.height) || target.ref.at[3], label: target.label };
  }

  /** What can be edited at a level (the screen, or inside a layer), back to front. */
  function targets(lv = level) {
    const screen = built();
    if (!screen) return [];
    if (!lv) {
      // The scene picture sets the screen's frame, so it is not moved here.
      const elements = screen.elements.filter((element) => element.id !== `${screen.id}-picture`).map((element) => ({
        key: `el:${element.node ?? element.id}`,
        label: element.type === "ui" ? element.ui : element.type === "text" ? `“${String(element.text).slice(0, 24)}”` : element.id === `${screen.id}-picture` ? "Scene picture" : element.id,
        kind: element.type,
        ref: element,
        field: "at",
        node: element.node,
        orderable: element.id !== `${screen.id}-picture`,
        canOpen: element.type === "ui"
      }));
      const objects = screen.objects.map((object) => ({ key: `obj:${object.node}`, label: `${object.id} (object)`, kind: "object", ref: object, field: "rect", node: object.node }));
      const exits = screen.exits.map((exit) => ({ key: `exit:${exit.node}`, label: `${exit.label} (exit)`, kind: "exit", ref: exit, field: "at", node: exit.node }));
      return [...elements, ...objects, ...exits];
    }
    const note = session.vault.notes[lv.uiId];
    const list = note?.blocks.Elements ?? [];
    list.forEach((element, index) => original.has(element) || original.set(element, index));
    return list
      .map((element, index) => ({
        lv,
        key: `ui:${lv.uiId}:${original.get(element)}`,
        label: element.id ?? `${element.type} ${index + 1}`,
        kind: element.type,
        ref: element,
        field: "at",
        index,
        orderable: true
      }))
      .filter((target) => Array.isArray(target.ref.at));
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

  function startDrag(event, target, mode) {
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
    const pending = edits.boxes.size + edits.order.size;

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
        ...(current.canOpen ? [button("Edit inside ▸", () => openLayer(current))] : [])
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
      if (target.key.startsWith("ui:")) {
        const [, uiId, index] = target.key.split(":");
        const path = vault.notes[uiId].path;
        (notes[path] ??= { boxes: [] }).boxes.push({ index: Number(index), at: target.ref.at.map(round) });
      } else {
        const [x, y, w, h] = target.ref[target.field];
        (canvases[worldPath] ??= { boxes: [] }).boxes.push({ node: target.node, x: ox + x * unit, y: oy + y * unit, width: w * unit, height: h * unit });
      }
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
      edits = { boxes: new Map(), order: new Map() };
      undo = [];
      redo = [];
      stale = false;
    }
    drawPanel();
  }

  // ---------------------------------------------------------------- on / off

  function toggle(value = !on) {
    if (value === on) return;
    if (!value && (edits.boxes.size || edits.order.size) && !confirm("Leave without saving? Your edits stay on screen until the game reloads.")) return;
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
    get dirty() { return Boolean(edits.boxes.size || edits.order.size); },
    panelWidth: () => (on ? PANEL_WIDTH : 0),
    toggle,
    /** The vault was rebuilt on disk while editing with unsaved changes. */
    markStale() { stale = true; drawPanel(); },
    /** Redraw the boxes after the game redrew (a new vault, a resize). */
    redraw() { if (on) { drawOverlay(); drawPanel(); } }
  };
}
