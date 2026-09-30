// Effects from ENGINE_SPEC.md section 4.7. Short-form strings such as
// "state trust +10" or "screen south-gate", or one-key objects such as
// { memory: { fact, tags } }. Effects that the world cannot hold by itself
// (sound, screen, end, ...) come back as events for the renderer to play.

const STATE_MIN = 0;
const STATE_MAX = 100;
const EVENT_KINDS = new Set([
  "say", "narrate", "sound", "music", "portrait", "animate", "show", "hide",
  "screen", "start-dialogue", "end", "wait", "send"
]);

function unquote(text) {
  const value = String(text ?? "").trim();
  return /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
}

/** Turns `[[south-gate]]` or `[[south-gate|label]]` into `south-gate`. */
export function stripLink(text) {
  return String(text ?? "").replace(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g, "$1");
}

function parseChange(text) {
  const value = String(text ?? "").trim();
  const match = value.match(/^(=\s*)?([+-]?\d+(?:\.\d+)?)$/);
  if (!match) throw new SyntaxError(`Expected +N, -N, or = N but found: ${value}`);
  return match[1] ? { set: Number(match[2]) } : { delta: Number(match[2]) };
}

export function parseEffect(effect) {
  if (effect && typeof effect === "object" && !Array.isArray(effect)) {
    const kinds = Object.keys(effect);
    if (kinds.length !== 1) throw new SyntaxError("An effect object must have exactly one key.");
    const kind = kinds[0];
    const value = effect[kind];
    return value && typeof value === "object" ? { kind, ...value } : { kind, value };
  }

  const source = stripLink(effect).trim();
  const [kind, ...rest] = source.split(/\s+/);
  const args = rest.join(" ");

  switch (kind) {
    case "state":
    case "counter": {
      const [key, ...change] = rest;
      if (!key) throw new SyntaxError(`Missing name in effect: ${source}`);
      return { kind, key, ...parseChange(change.join(" ")) };
    }
    case "flag":
      if (!rest[0]) throw new SyntaxError(`Missing flag name in effect: ${source}`);
      return { kind, key: rest[0], value: !["off", "false"].includes(rest[1]) };
    case "var": {
      const match = args.match(/^([\w.-]+)\s*=\s*(.+)$/);
      if (!match) throw new SyntaxError(`Expected "var name = value": ${source}`);
      return { kind, key: match[1], value: unquote(match[2]) };
    }
    case "item":
      if (!rest[0]) throw new SyntaxError(`Missing item id in effect: ${source}`);
      return { kind, key: rest[0], value: rest[1] ?? "held" };
    case "open":
    case "close":
      if (!rest[0]) throw new SyntaxError(`Missing object id in effect: ${source}`);
      return { kind, key: rest[0] };
    case "portrait":
      return { kind, character: rest[0], cue: rest[1] ?? "neutral" };
    case "narrate":
    case "say":
      return { kind, value: unquote(args) };
    default:
      if (EVENT_KINDS.has(kind)) return { kind, value: unquote(args) };
      throw new SyntaxError(`Unknown effect: ${source}`);
  }
}

function clampState(value) {
  return Math.min(STATE_MAX, Math.max(STATE_MIN, value));
}

/**
 * Applies effects in order to a copy of the world. Returns the new world and
 * the events the renderer should play.
 */
export function applyEffects(effects, world = {}) {
  const next = structuredClone(world);
  const events = [];

  for (const effect of [].concat(effects ?? [])) {
    const parsed = parseEffect(effect);
    switch (parsed.kind) {
      case "state": {
        next.state ??= {};
        const current = Number(next.state[parsed.key]) || 0;
        next.state[parsed.key] = clampState(parsed.set ?? current + parsed.delta);
        break;
      }
      case "counter": {
        next.counter ??= {};
        const current = Number(next.counter[parsed.key]) || 0;
        next.counter[parsed.key] = parsed.set ?? current + parsed.delta;
        break;
      }
      case "flag":
        next.flag ??= {};
        next.flag[parsed.key] = parsed.value;
        break;
      case "var":
        next.var ??= {};
        next.var[parsed.key] = parsed.value;
        break;
      case "item":
        next.item ??= {};
        next.item[parsed.key] = parsed.value;
        break;
      case "memory": {
        const { kind: _kind, ...memory } = parsed;
        next.memories = [...(next.memories ?? []), { ...memory, createdTurn: next.turn ?? 0 }];
        break;
      }
      case "open":
        next.open = { ...(next.open ?? {}), [parsed.key]: true };
        events.push(parsed);
        break;
      case "close":
        next.open = { ...(next.open ?? {}), [parsed.key]: false };
        events.push(parsed);
        break;
      case "screen":
        next.screen = parsed.value;
        next.open = {};
        events.push(parsed);
        break;
      case "end":
        next.outcome ??= parsed.value;
        events.push(parsed);
        break;
      default:
        events.push(parsed);
    }
  }

  return { world: next, events };
}
