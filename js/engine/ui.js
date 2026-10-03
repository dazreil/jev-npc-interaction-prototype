// Custom UI from ENGINE_SPEC.md section 7.1. A UI note lists elements:
// primitives (rect, ellipse, line, polygon, text, bar), images (image,
// nine-slice), controls (button), containers (group), and slots where the
// engine mounts live widgets such as the portrait or the conversation log.
// A `ui` element draws another UI note inside this one, scaled to its box;
// that is how an in-world object such as the intercom opens over a scene.
//
// resolveUi() is pure: it applies the theme, conditions, and bindings and
// returns a plain tree. mountUi() turns that tree into DOM.

import { evaluate, interpolate, readPath } from "./conditions.js";

const COMMON = ["type", "id", "at", "style", "visible", "opacity", "rotate", "children", "note", "layer", "mirror", "swing", "shade", "walk", "clip", "node"];
const PAINT = ["fill", "stroke", "strokeWidth", "radius", "glow", "pattern", "blur"];
const TEXT = ["text", "size", "color", "font", "align", "valign", "bold", "italic", "letterSpacing", "uppercase", "padding"];
export const ELEMENT_PROPS = Object.freeze({
  rect: [...PAINT],
  ellipse: [...PAINT],
  line: ["from", "to", "stroke", "strokeWidth", "dash", "glow"],
  polygon: ["points", "fill", "stroke", "strokeWidth", "glow"],
  text: [...TEXT, "fill"],
  image: ["src", "fit", "pixelated", "focus"],
  "nine-slice": ["src", "slice", "border", "pixelated"],
  bar: ["value", "max", "fill", "back", "stroke", "strokeWidth", "radius", "vertical"],
  button: [...PAINT, ...TEXT, "label", "do", "key", "image", "hoverImage", "pressedImage", "hoverFill", "disabled", "hoverLabel", "mask", "maskFit", "maskFocus"],
  group: [...PAINT, "clip"],
  ui: ["ui"],
  slot: ["name", ...PAINT]
});

function list(value) {
  return value == null ? [] : [].concat(value);
}

function resolveToken(value, theme) {
  if (typeof value === "string" && value.startsWith("$")) {
    const name = value.slice(1);
    return theme.colors?.[name] ?? theme.fonts?.[name] ?? theme.sizes?.[name] ?? value;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.map((item) => resolveToken(item, theme));
  }
  return value;
}

function mergeStyles(element, theme, warnings) {
  const merged = {};
  for (const name of list(element.style)) {
    const style = theme.styles?.[name];
    if (!style) warnings.push(`${element.id ?? element.type}: unknown style "${name}"`);
    else Object.assign(merged, style);
  }
  return { ...merged, ...element };
}

function box(at, parent) {
  if (at == null) return { x: 0, y: 0, w: parent.w, h: parent.h };
  if (!Array.isArray(at) || at.length !== 4 || at.some((n) => !Number.isFinite(Number(n)))) {
    throw new TypeError(`"at" must be [x, y, width, height], found ${JSON.stringify(at)}`);
  }
  const [x, y, w, h] = at.map(Number);
  return { x, y, w, h };
}

function resolveElement(raw, context, parentBox, path) {
  const { theme, world, warnings } = context;
  const element = mergeStyles(raw, theme, warnings);
  const label = element.id ?? `${path}`;
  const allowed = ELEMENT_PROPS[element.type];
  if (!allowed) throw new TypeError(`${label}: unknown element type "${element.type}"`);
  for (const key of Object.keys(element)) {
    if (!COMMON.includes(key) && !allowed.includes(key)) warnings.push(`${label}: "${key}" does nothing on a ${element.type}`);
  }
  if (!evaluate(element.visible, world)) return null;

  const props = {};
  for (const key of allowed) {
    if (element[key] !== undefined) props[key] = resolveToken(element[key], theme);
  }
  if (typeof props.text === "string") props.text = interpolate(props.text, world);
  if (typeof props.label === "string") props.label = interpolate(props.label, world);
  if (element.type === "bar") {
    const value = typeof props.value === "number" ? props.value : Number(readPath(world, props.value)) || 0;
    props.ratio = Math.min(1, Math.max(0, value / (Number(props.max) || 100)));
  }
  if (element.type === "button") props.disabled = props.disabled !== undefined && evaluate(props.disabled, world);

  const nodeBox = box(element.at, parentBox);
  let childSource = element.children;
  let childBox = nodeBox;
  if (element.type === "ui") {
    const inner = context.uis?.[props.ui];
    if (!inner) throw new TypeError(`${label}: UI note "${props.ui}" not found`);
    if (context.depth > 4) throw new TypeError(`${label}: UI notes nest too deeply`);
    childSource = inner.elements;
    childBox = { x: 0, y: 0, w: Number(inner.width) || nodeBox.w, h: Number(inner.height) || nodeBox.h };
    props.innerWidth = childBox.w;
    props.innerHeight = childBox.h;
    props.background = resolveToken(inner.background, context.theme);
    context.depth += 1;
  }
  const children = list(childSource)
    .map((child, index) => resolveElement(child, context, childBox, `${label}.${index}`))
    .filter(Boolean);
  if (element.type === "ui") context.depth -= 1;

  // `swing` turns an element toward a hinge edge while its condition holds:
  // a gate leaf opening, done as a 2D squash in a few held steps.
  let swing = null;
  if (element.swing) {
    const settings = element.swing;
    swing = {
      open: evaluate(settings.when ?? false, world),
      hinge: settings.hinge === "right" ? "right" : "left",
      to: Number(settings.to ?? 0.15),
      seconds: Number(settings.seconds ?? 1.5),
      steps: Number(settings.steps ?? 6)
    };
    if (!element.id) warnings.push(`${label}: a swing needs an id, so it can keep playing across redraws`);
  }
  // `walk` moves an element in a straight line to `to` (and back), in held
  // steps, while its condition holds: a walk-cycle sprite crossing a scene.
  // The picture faces right; it turns to face the way it goes.
  let walk = null;
  if (element.walk) {
    const settings = element.walk;
    const to = list(settings.to).map(Number);
    if (to.length !== 2) warnings.push(`${label}: walk needs to: [x, y]`);
    walk = {
      on: settings.when === undefined ? true : evaluate(settings.when, world),
      dx: (to[0] ?? nodeBox.x) - nodeBox.x,
      dy: (to[1] ?? nodeBox.y) - nodeBox.y,
      seconds: Number(settings.seconds ?? 10),
      back: settings.back !== false,
      loop: settings.loop === true,
      fps: Number(settings.fps ?? 8)
    };
    if (!element.id) warnings.push(`${label}: a walk needs an id, so it can keep going across redraws`);
    if (element.swing || element.mirror) warnings.push(`${label}: walk does not mix with swing or mirror`);
  }
  // `clip` plays a numbered frame sequence (src is frame -01) on a clock
  // while its condition holds: once across, then, with `back`, mirrored
  // back again after `gap` seconds. Hidden between legs. For a walk filmed
  // across the whole frame, so the engine does not move it.
  let clip = null;
  if (element.clip) {
    const settings = element.clip;
    clip = {
      on: settings.when === undefined ? true : evaluate(settings.when, world),
      frames: Number(settings.frames ?? 1),
      fps: Number(settings.fps ?? 8),
      back: settings.back !== false,
      gap: Number(settings.gap ?? 0),
      wait: Number(settings.wait ?? 0),
      loop: settings.loop === true
    };
    if (element.type !== "image") warnings.push(`${label}: clip only works on an image`);
    if (!element.id) warnings.push(`${label}: a clip needs an id, so it can keep playing across redraws`);
    if (!/-0*1\.\w+$/.test(String(element.src ?? "").replace(/\]\]$/, ""))) warnings.push(`${label}: a clip's src must be its first frame (name-01.webp)`);
  }
  if (element.mirror && element.swing) warnings.push(`${label}: mirror and swing do not mix; use a mirrored picture for a swinging leaf`);

  return {
    id: element.id ?? null,
    type: element.type,
    box: nodeBox,
    opacity: element.opacity,
    rotate: element.rotate,
    mirror: element.mirror === true,
    shade: element.shade === undefined ? undefined : Math.min(1, Math.max(0, Number(element.shade))),
    swing,
    walk,
    clip,
    props,
    children
  };
}

/**
 * Resolves a UI definition against a theme and the world.
 * @returns {{ width, height, children, warnings }}
 */
export function resolveUi(ui, { theme = {}, world = {}, uis = {} } = {}) {
  const width = Number(ui.width) || 640;
  const height = Number(ui.height) || 360;
  const context = { theme, world, uis, depth: 0, warnings: [] };
  const children = list(ui.elements)
    .map((element, index) => resolveElement(element, context, { x: 0, y: 0, w: width, h: height }, `element ${index + 1}`))
    .filter(Boolean);
  return { width, height, background: resolveToken(ui.background, theme), children, warnings: context.warnings };
}

// ------------------------------------------------------------------ DOM

const SVG = "http://www.w3.org/2000/svg";

function paint(style, props) {
  const fill = props.fill;
  if (Array.isArray(fill)) style.background = `linear-gradient(180deg, ${fill.join(", ")})`;
  else if (fill) style.background = fill;
  if (props.pattern === "scanlines") {
    const lines = "repeating-linear-gradient(0deg, transparent 0 3px, rgba(255,255,255,.06) 3px 4px)";
    style.background = style.background ? `${lines}, ${style.background}` : lines;
  }
  // Strokes are inset shadows, not borders, so children keep the same origin
  // as their parent box.
  const shadows = [];
  if (props.stroke) shadows.push(`inset 0 0 0 ${props.strokeWidth ?? 1}px ${props.stroke}`);
  if (props.glow) shadows.push(`0 0 12px ${props.glow}`);
  if (shadows.length) style.boxShadow = shadows.join(", ");
  if (props.radius !== undefined) style.borderRadius = `${props.radius}px`;
  if (props.blur) style.backdropFilter = `blur(${props.blur}px)`;
}

function typeset(style, props) {
  if (props.color) style.color = props.color;
  if (props.size) style.fontSize = `${props.size}px`;
  if (props.font) style.fontFamily = props.font;
  if (props.bold) style.fontWeight = "700";
  if (props.letterSpacing !== undefined) style.letterSpacing = `${props.letterSpacing}px`;
  if (props.uppercase) style.textTransform = "uppercase";
  if (props.italic) style.fontStyle = "italic";
  if (props.padding !== undefined) style.padding = `${props.padding}px`;
  style.display = "flex";
  style.justifyContent = { left: "flex-start", center: "center", right: "flex-end" }[props.align ?? "left"];
  style.textAlign = props.align ?? "left";
  style.alignItems = { top: "flex-start", middle: "center", bottom: "flex-end" }[props.valign ?? "top"];
  style.lineHeight = "1.1";
  style.whiteSpace = "pre-wrap";
}

function vector(node, parentBox) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("width", parentBox.w);
  svg.setAttribute("height", parentBox.h);
  svg.setAttribute("viewBox", `0 0 ${parentBox.w} ${parentBox.h}`);
  Object.assign(svg.style, { position: "absolute", left: "0", top: "0", overflow: "visible", pointerEvents: "none" });
  const { props } = node;
  const shape = document.createElementNS(SVG, node.type === "line" ? "line" : "polygon");
  if (node.type === "line") {
    const [x1, y1] = props.from ?? [0, 0];
    const [x2, y2] = props.to ?? [0, 0];
    Object.entries({ x1, y1, x2, y2 }).forEach(([key, value]) => shape.setAttribute(key, value));
    if (props.dash) shape.setAttribute("stroke-dasharray", [].concat(props.dash).join(" "));
  } else {
    shape.setAttribute("points", (props.points ?? []).map((point) => point.join(",")).join(" "));
    shape.setAttribute("fill", props.fill ?? "none");
  }
  shape.setAttribute("stroke", props.stroke ?? "none");
  shape.setAttribute("stroke-width", props.strokeWidth ?? 1);
  if (props.glow) shape.style.filter = `drop-shadow(0 0 4px ${props.glow})`;
  svg.append(shape);
  return svg;
}

// When each swing started opening, by element id. The screen is rebuilt on
// every change, so a swing resumes from the right point instead of
// restarting: its CSS animation starts with a negative delay.
const swingStarts = new Map();

function applySwing(element, node) {
  const { open, hinge, to, seconds, steps } = node.swing;
  const style = element.style;
  style.transformOrigin = `${hinge} center`;
  if (!open) {
    swingStarts.delete(node.id);
    return;
  }
  if (!swingStarts.has(node.id)) swingStarts.set(node.id, performance.now());
  const elapsed = (performance.now() - swingStarts.get(node.id)) / 1000;
  const name = `ui-swing-${String(to).replace(/\W/g, "_")}`;
  let sheet = document.getElementById("ui-swing-css");
  if (!sheet) {
    sheet = document.createElement("style");
    sheet.id = "ui-swing-css";
    document.head.append(sheet);
  }
  if (!sheet.textContent.includes(`@keyframes ${name} `)) {
    sheet.textContent += `@keyframes ${name} { from { transform: scaleX(1); } to { transform: scaleX(${to}); } }\n`;
  }
  style.transform = `scaleX(${to})`;
  style.animation = `${name} ${seconds}s steps(${steps}, end) ${-elapsed}s 1 both`;
}

// The screen editor holds animations still: a clip shows its first frame and
// a walker stands at its start, so you can see and grab them. One that is
// switched off right now shows see-through.
let editorPreview = false;
export function setEditorPreview(value) {
  editorPreview = Boolean(value);
}

const clipStarts = new Map();
const clipElements = new Map();
let clipTicker = null;

/** Which frame shows at `now`, and facing which way; null when hidden. */
export function clipFrame(clip, seconds) {
  const { frames, fps, back, gap, wait, loop } = clip;
  const leg = frames / fps;
  const cycle = wait + (back ? 2 * leg + gap : leg) + (loop ? gap : 0);
  let t = seconds;
  if (loop) t %= cycle;
  t -= wait;
  if (t >= 0 && t < leg) return { frame: Math.floor(t * fps), flip: false };
  t -= leg + gap;
  if (back && t >= 0 && t < leg) return { frame: Math.floor(t * fps), flip: true };
  return null;
}

function frameSrc(src, index) {
  return src.replace(/-0*1(\.\w+)((?:[?#].*)?)$/, (_, ext, rest) => `-${String(index + 1).padStart(2, "0")}${ext}${rest}`);
}

function showClip(element, node, now) {
  const shown = clipFrame(node.clip, (now - clipStarts.get(node.id)) / 1000);
  element.style.visibility = shown ? "visible" : "hidden";
  if (!shown) return;
  element.style.transform = shown.flip ? "scaleX(-1)" : "";
  const src = frameSrc(node.props.src, shown.frame);
  if (element.getAttribute("src") !== src) element.src = src;
}

function applyClip(element, node) {
  if (editorPreview) {
    Object.assign(element.style, { visibility: "visible", transform: "", opacity: node.clip.on ? "" : "0.45" });
    element.src = frameSrc(node.props.src, 0);
    return;
  }
  if (!node.clip.on) {
    clipStarts.delete(node.id);
    element.style.display = "none";
    return;
  }
  if (!clipStarts.has(node.id)) {
    clipStarts.set(node.id, performance.now());
    // Load every frame now, so the first pass does not stutter.
    for (let index = 0; index < node.clip.frames; index += 1) new Image().src = frameSrc(node.props.src, index);
  }
  clipElements.set(node.id, { element, node });
  showClip(element, node, performance.now());
  clipTicker ??= setInterval(() => {
    const now = performance.now();
    for (const [id, entry] of clipElements) {
      if (entry.element.isConnected) showClip(entry.element, entry.node, now);
      else if (clipElements.get(id) === entry) clipElements.delete(id);
    }
    if (!clipElements.size) {
      clearInterval(clipTicker);
      clipTicker = null;
    }
  }, 1000 / 24);
}

const walkStarts = new Map();
function applyWalk(element, node) {
  const { on, dx, dy, seconds, back, loop, fps } = node.walk;
  const style = element.style;
  if (editorPreview) {
    Object.assign(style, { animation: "none", transform: "", opacity: on ? "" : "0.45" });
    return;
  }
  if (!on) {
    walkStarts.delete(node.id);
    style.display = "none";
    return;
  }
  if (!walkStarts.has(node.id)) walkStarts.set(node.id, performance.now());
  const elapsed = (performance.now() - walkStarts.get(node.id)) / 1000;
  const face = dx >= 0 ? 1 : -1;
  const at = (x, y, facing) => `transform: translate(${x}px, ${y}px) scaleX(${facing});`;
  const frames = back
    ? `0% { ${at(0, 0, face)} } 49.99% { ${at(dx, dy, face)} } 50% { ${at(dx, dy, -face)} } 100% { ${at(0, 0, -face)} }`
    : `0% { ${at(0, 0, face)} } 100% { ${at(dx, dy, face)} }`;
  const name = `ui-walk-${String(node.id).replace(/\W/g, "_")}-${Math.round(dx)}-${Math.round(dy)}-${back ? "b" : "o"}`;
  let sheet = document.getElementById("ui-swing-css");
  if (!sheet) {
    sheet = document.createElement("style");
    sheet.id = "ui-swing-css";
    document.head.append(sheet);
  }
  if (!sheet.textContent.includes(`@keyframes ${name} `)) sheet.textContent += `@keyframes ${name} { ${frames} }\n`;
  // Steps apply per leg, so the sprite moves in held steps like its frames.
  const steps = Math.max(1, Math.round((back ? seconds / 2 : seconds) * fps));
  style.animation = `${name} ${seconds}s steps(${steps}, end) ${-elapsed}s ${loop ? "infinite" : 1} both`;
}

function mountNode(node, parentBox, options) {
  if (node.type === "line" || node.type === "polygon") return vector(node, parentBox);

  const { props } = node;
  const element = document.createElement(node.type === "button" ? "button" : node.type === "image" ? "img" : "div");
  element.className = `ui-el ui-${node.type}`;
  if (node.id) element.dataset.uiId = node.id;
  const style = element.style;
  Object.assign(style, {
    position: "absolute",
    left: `${node.box.x}px`,
    top: `${node.box.y}px`,
    width: `${node.box.w}px`,
    height: `${node.box.h}px`,
    boxSizing: "border-box",
    margin: "0"
  });
  if (node.opacity !== undefined) style.opacity = String(node.opacity);
  // shade: 0 = black, 1 = as drawn. Darkens a bright prop to sit in a dark scene.
  if (node.shade !== undefined) style.filter = `brightness(${node.shade})`;
  const transforms = [];
  if (node.rotate) transforms.push(`rotate(${node.rotate}deg)`);
  if (node.mirror && !node.swing) transforms.push("scaleX(-1)");
  if (transforms.length) style.transform = transforms.join(" ");
  if (node.swing) applySwing(element, node);
  if (node.walk) applyWalk(element, node);
  if (node.clip) applyClip(element, node);

  switch (node.type) {
    case "rect":
    case "group":
    case "slot":
      paint(style, props);
      if (props.clip) style.overflow = "hidden";
      if (node.type === "slot") {
        element.dataset.slot = props.name ?? "";
        if (options.previewSlots) {
          element.classList.add("ui-slot-preview");
          element.textContent = `slot: ${props.name}`;
        }
        options.slots?.set(props.name, element);
      }
      break;
    case "ellipse":
      paint(style, props);
      style.borderRadius = "50%";
      break;
    case "text":
      paint(style, props);
      typeset(style, props);
      element.textContent = props.text ?? "";
      break;
    case "image":
      // Redraws rebuild the tree; decode synchronously from the cache so a
      // picture never blinks blank between frames.
      element.decoding = "sync";
      element.src = props.src;
      element.alt = "";
      style.objectFit = props.fit ?? "contain";
      if (Array.isArray(props.focus)) style.objectPosition = `${props.focus[0]}% ${props.focus[1]}%`;
      if (props.pixelated) style.imageRendering = "pixelated";
      break;
    case "nine-slice": {
      // The frame is drawn on its own layer so children keep the outer origin.
      const slice = [].concat(props.slice ?? 8).join(" ");
      const border = [].concat(props.border ?? props.slice ?? 8).map((n) => `${n}px`).join(" ");
      const frame = document.createElement("div");
      Object.assign(frame.style, {
        position: "absolute",
        inset: "0",
        boxSizing: "border-box",
        borderStyle: "solid",
        borderWidth: border,
        borderImage: `url("${props.src}") ${slice} fill / ${border} stretch`,
        imageRendering: props.pixelated ? "pixelated" : ""
      });
      element.append(frame);
      break;
    }
    case "bar": {
      paint(style, { fill: props.back, stroke: props.stroke, strokeWidth: props.strokeWidth, radius: props.radius });
      style.overflow = "hidden";
      const fill = document.createElement("div");
      Object.assign(fill.style, {
        position: "absolute",
        left: "0",
        bottom: "0",
        background: Array.isArray(props.fill) ? `linear-gradient(90deg, ${props.fill.join(", ")})` : props.fill ?? "currentColor",
        width: props.vertical ? "100%" : `${props.ratio * 100}%`,
        height: props.vertical ? `${props.ratio * 100}%` : "100%"
      });
      element.setAttribute("role", "meter");
      element.setAttribute("aria-valuenow", String(Math.round(props.ratio * 100)));
      element.setAttribute("aria-valuemin", "0");
      element.setAttribute("aria-valuemax", "100");
      element.append(fill);
      break;
    }
    case "button": {
      element.type = "button";
      paint(style, props);
      typeset(style, { align: "center", valign: "middle", ...props });
      style.cursor = props.disabled ? "default" : "pointer";
      if (props.image) {
        style.background = `center / 100% 100% no-repeat url("${props.image}")`;
        style.setProperty("--ui-hover-image", `url("${props.hoverImage ?? props.image}")`);
        style.setProperty("--ui-pressed-image", `url("${props.pressedImage ?? props.hoverImage ?? props.image}")`);
        element.classList.add("ui-button-image");
      }
      if (props.hoverFill) {
        style.setProperty("--ui-hover-fill", props.hoverFill);
        element.dataset.hoverFill = "";
      }
      element.disabled = props.disabled;
      if (props.key) element.dataset.key = props.key;
      const label = document.createElement("span");
      label.textContent = props.label ?? "";
      // hoverLabel: the label shows only on hover or keyboard focus, so a
      // hotspot does not cover the art it sits on.
      if (props.hoverLabel) label.className = "ui-hover-label";
      element.append(label);
      if (props.label) element.setAttribute("aria-label", props.label);
      element.addEventListener("click", () => options.onAction?.(props.do ?? [], node));
      // mask: the hotspot takes the shape of a picture (a character on a
      // screen). Only its solid pixels take clicks and show the hover fill.
      if (props.mask) {
        const focus = Array.isArray(props.maskFocus) ? props.maskFocus.map(Number) : [50, 50];
        const key = `${props.mask}|${Math.round(node.box.w)}|${Math.round(node.box.h)}|${props.maskFit ?? "cover"}|${focus.join(",")}`;
        const hit = document.createElement("span");
        hit.className = "ui-hit";
        hit.dataset.maskKey = key;
        const path = maskPath(key, props.mask, node.box.w, node.box.h, props.maskFit ?? "cover", focus);
        if (path) hit.style.clipPath = path;
        element.dataset.mask = "";
        element.prepend(hit);
      }
      break;
    }
    case "ui": {
      const inner = document.createElement("div");
      Object.assign(inner.style, {
        position: "absolute",
        left: "0",
        top: "0",
        width: `${props.innerWidth}px`,
        height: `${props.innerHeight}px`,
        transformOrigin: "0 0",
        transform: `scale(${node.box.w / props.innerWidth}, ${node.box.h / props.innerHeight})`,
        background: props.background ?? ""
      });
      element.append(inner);
      const innerBox = { x: 0, y: 0, w: props.innerWidth, h: props.innerHeight };
      for (const child of node.children) inner.append(mountNode(child, innerBox, options));
      return element;
    }
    default:
      break;
  }

  for (const child of node.children) element.append(mountNode(child, node.box, options));
  return element;
}

// Clip paths for masked hotspots, by picture and size. A picture's shape is
// worked out once, after it loads; until then the whole box takes clicks.
const MASK_CELL = 3;
const maskCache = new Map();

function maskPath(key, src, width, height, fit, focus = [50, 50]) {
  if (maskCache.has(key)) return maskCache.get(key);
  maskCache.set(key, null);
  if (typeof Image === "undefined") return null;
  const image = new Image();
  image.onload = () => {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    // Place the picture the same way the image element does (cover or contain, at its focus).
    const k = (fit === "contain" ? Math.min : Math.max)(w / image.naturalWidth, h / image.naturalHeight);
    const dw = image.naturalWidth * k;
    const dh = image.naturalHeight * k;
    context.drawImage(image, ((w - dw) * focus[0]) / 100, ((h - dh) * focus[1]) / 100, dw, dh);
    const alpha = context.getImageData(0, 0, w, h).data;
    const solid = (x, y) => alpha[(Math.min(h - 1, y) * w + Math.min(w - 1, x)) * 4 + 3] > 96;
    let path = "";
    for (let y = 0; y < h; y += MASK_CELL) {
      let start = -1;
      for (let x = 0; x <= w; x += MASK_CELL) {
        const on = x < w && solid(x + 1, y + 1);
        if (on && start < 0) start = x;
        if (!on && start >= 0) {
          path += `M${start} ${y}h${x - start}v${MASK_CELL}h${start - x}Z`;
          start = -1;
        }
      }
    }
    const clip = `path("${path || "M0 0Z"}")`;
    maskCache.set(key, clip);
    for (const hit of document.querySelectorAll(".ui-hit")) if (hit.dataset.maskKey === key) hit.style.clipPath = clip;
    window.dispatchEvent(new CustomEvent("ui-mask-ready", { detail: { key } }));
  };
  image.src = src;
  return null;
}

/**
 * The clip path for a picture's shape at this size (null until it has loaded;
 * then "ui-mask-ready" fires on window). The editor uses it to draw click shapes.
 */
export function pictureShape(src, width, height, fit = "cover", focus = [50, 50]) {
  const key = `${src}|${Math.round(width)}|${Math.round(height)}|${fit}|${focus.join(",")}`;
  return maskPath(key, src, width, height, fit, focus);
}

const BASE_CSS = `
.ui-root { position: relative; overflow: hidden; transform-origin: 0 0; }
.ui-root .ui-button { border: 0; padding: 0; color: inherit; font: inherit; background: transparent; }
.ui-root .ui-button:not(:disabled):hover { filter: brightness(1.3); }
.ui-root .ui-button[data-hover-fill]:not(:disabled):hover { filter: none; background: var(--ui-hover-fill) !important; }
.ui-root .ui-button:not(:disabled):active { filter: brightness(0.85); }
.ui-root .ui-button-image:not(:disabled):hover { background-image: var(--ui-hover-image); }
.ui-root .ui-button-image:not(:disabled):active { background-image: var(--ui-pressed-image); }
.ui-root .ui-button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.ui-root .ui-button .ui-hover-label { opacity: 0; transition: opacity .12s; }
.ui-root .ui-button:hover .ui-hover-label, .ui-root .ui-button:focus-visible .ui-hover-label { opacity: 1; }
.ui-root .ui-button:disabled { opacity: 0.45; }
.ui-root .ui-button[data-mask], .ui-root .ui-button[data-mask][data-hover-fill]:not(:disabled):hover, .ui-root .ui-button[data-mask]:not(:disabled):hover, .ui-root .ui-button[data-mask]:not(:disabled):active { pointer-events: none; background: transparent !important; filter: none !important; }
.ui-root .ui-button[data-mask] .ui-hit { position: absolute; inset: 0; pointer-events: auto; cursor: pointer; }
.ui-root .ui-button[data-mask]:hover .ui-hit { background: var(--ui-hover-fill, #ffffff22); }
.ui-root .ui-button[data-mask] > span:not(.ui-hit) { pointer-events: none; }
.ui-root .ui-slot-preview { outline: 1px dashed rgba(255,255,255,.45); color: rgba(255,255,255,.6); font: 12px monospace; display: flex; align-items: center; justify-content: center; }
`;

/**
 * Draws a resolved UI into a container, replacing what was there.
 * @param options.onAction called with (effects, node) when a button is clicked
 * @param options.previewSlots draw slots as labelled dashed boxes
 * @returns {{ root: HTMLElement, slots: Map<string, HTMLElement> }}
 */
export function mountUi(container, resolved, options = {}) {
  if (!document.getElementById("ui-engine-css")) {
    const css = document.createElement("style");
    css.id = "ui-engine-css";
    css.textContent = BASE_CSS;
    document.head.append(css);
  }
  const slots = new Map();
  const root = document.createElement("div");
  root.className = "ui-root";
  Object.assign(root.style, { width: `${resolved.width}px`, height: `${resolved.height}px` });
  if (resolved.background) root.style.background = resolved.background;
  const rootBox = { x: 0, y: 0, w: resolved.width, h: resolved.height };
  for (const node of resolved.children) root.append(mountNode(node, rootBox, { ...options, slots }));
  container.replaceChildren(root);
  return { root, slots };
}
