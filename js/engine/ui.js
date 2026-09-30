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

const COMMON = ["type", "id", "at", "style", "visible", "opacity", "rotate", "children", "note", "layer"];
const PAINT = ["fill", "stroke", "strokeWidth", "radius", "glow", "pattern", "blur"];
const TEXT = ["text", "size", "color", "font", "align", "valign", "bold", "letterSpacing", "uppercase", "padding"];
export const ELEMENT_PROPS = Object.freeze({
  rect: [...PAINT],
  ellipse: [...PAINT],
  line: ["from", "to", "stroke", "strokeWidth", "dash", "glow"],
  polygon: ["points", "fill", "stroke", "strokeWidth", "glow"],
  text: [...TEXT, "fill"],
  image: ["src", "fit", "pixelated"],
  "nine-slice": ["src", "slice", "border", "pixelated"],
  bar: ["value", "max", "fill", "back", "stroke", "strokeWidth", "radius", "vertical"],
  button: [...PAINT, ...TEXT, "label", "do", "key", "image", "hoverImage", "pressedImage", "hoverFill", "disabled"],
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

  return {
    id: element.id ?? null,
    type: element.type,
    box: nodeBox,
    opacity: element.opacity,
    rotate: element.rotate,
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
  if (node.rotate) style.transform = `rotate(${node.rotate}deg)`;

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
      element.append(label);
      if (props.label) element.setAttribute("aria-label", props.label);
      element.addEventListener("click", () => options.onAction?.(props.do ?? [], node));
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

const BASE_CSS = `
.ui-root { position: relative; overflow: hidden; transform-origin: 0 0; }
.ui-root .ui-button { border: 0; padding: 0; color: inherit; font: inherit; background: transparent; }
.ui-root .ui-button:not(:disabled):hover { filter: brightness(1.3); }
.ui-root .ui-button[data-hover-fill]:not(:disabled):hover { filter: none; background: var(--ui-hover-fill) !important; }
.ui-root .ui-button:not(:disabled):active { filter: brightness(0.85); }
.ui-root .ui-button-image:not(:disabled):hover { background-image: var(--ui-hover-image); }
.ui-root .ui-button-image:not(:disabled):active { background-image: var(--ui-pressed-image); }
.ui-root .ui-button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.ui-root .ui-button:disabled { opacity: 0.45; }
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
