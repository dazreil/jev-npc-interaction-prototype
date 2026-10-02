// Conditions from ENGINE_SPEC.md section 4.6. A condition is parsed, never
// run as code: short-form strings, lists of them (all must hold), or long-form
// { all, any, not } groups that nest.

const COMPARE_PATTERN = /^([\w.-]+)\s*(<=|>=|!=|=|<|>)\s*([^<>=!\s].*)$/;
const IN_PATTERN = /^(not\s+)?([\w.-]+)\s+in\s+\[(.*)\]$/;
const MEMORY_PATTERN = /^(some|no)\s+memory\.(tag|topic)\s+in\s+\[(.*)\](?:\s+since\s+([\w-]+))?$/;
const KEY_PATTERN = /^(not\s+)?([\w.-]+)$/;

function splitList(text) {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseLiteral(text) {
  const value = text.trim();
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^(["']).*\1$/.test(value)) return value.slice(1, -1);
  return value;
}

export function parseCondition(text) {
  const source = String(text).trim();
  let match = source.match(MEMORY_PATTERN);
  if (match) {
    return { kind: "memory", mode: match[1], field: match[2], tags: splitList(match[3]), since: match[4] ?? null };
  }
  match = source.match(IN_PATTERN);
  if (match) {
    return { kind: "in", key: match[2], values: splitList(match[3]).map(parseLiteral), negate: Boolean(match[1]) };
  }
  match = source.match(COMPARE_PATTERN);
  if (match) return { kind: "compare", key: match[1], op: match[2], value: parseLiteral(match[3]) };
  match = source.match(KEY_PATTERN);
  if (match) return { kind: "truthy", key: match[2], negate: Boolean(match[1]) };
  throw new SyntaxError(`Unknown condition: ${source}`);
}

/** Reads "state.trust" or "flag.gate-open" from the world. */
export function readPath(world, key) {
  return String(key)
    .split(".")
    .reduce((value, part) => (value == null ? undefined : value[part]), world);
}

function resolveValue(world, value) {
  if (typeof value !== "string" || !value.includes(".")) return value;
  const found = readPath(world, value);
  return found === undefined ? value : found;
}

function compare(left, op, right) {
  switch (op) {
    case "=": return left == right; // eslint-disable-line eqeqeq -- "5" from text equals 5
    case "!=": return left != right; // eslint-disable-line eqeqeq
    case "<": return Number(left) < Number(right);
    case "<=": return Number(left) <= Number(right);
    case ">": return Number(left) > Number(right);
    case ">=": return Number(left) >= Number(right);
    default: throw new SyntaxError(`Unknown operator: ${op}`);
  }
}

function memoryMatches(world, { mode, field = "tag", tags, since }) {
  const memories = Array.isArray(world.memories) ? world.memories : [];
  const cutoff = since
    ? memories.reduce(
        (latest, memory) =>
          memory.tags?.includes(since) ? Math.max(latest, Number(memory.createdTurn) || 0) : latest,
        -1
      )
    : -Infinity;
  const found = memories.some(
    (memory) =>
      (Number(memory.createdTurn) || 0) > cutoff &&
      (field === "topic" ? tags.includes(memory.topic) : memory.tags?.some((tag) => tags.includes(tag)))
  );
  return mode === "some" ? found : !found;
}

function evaluateParsed(parsed, world) {
  switch (parsed.kind) {
    case "truthy": {
      const value = Boolean(readPath(world, parsed.key));
      return parsed.negate ? !value : value;
    }
    case "compare":
      return compare(readPath(world, parsed.key), parsed.op, resolveValue(world, parsed.value));
    case "in": {
      const value = readPath(world, parsed.key);
      const found = parsed.values.some((candidate) => candidate == value); // eslint-disable-line eqeqeq
      return parsed.negate ? !found : found;
    }
    case "memory":
      return memoryMatches(world, parsed);
    default:
      throw new SyntaxError(`Unknown condition kind: ${parsed.kind}`);
  }
}

/**
 * True when the condition holds. A missing condition (undefined, null, or an
 * empty list) always holds, so optional `visible` and `available` fields work.
 */
export function evaluate(condition, world = {}) {
  if (condition == null) return true;
  if (typeof condition === "boolean") return condition;
  if (typeof condition === "string") return evaluateParsed(parseCondition(condition), world);
  if (Array.isArray(condition)) return condition.every((item) => evaluate(item, world));
  if (typeof condition === "object") {
    const groups = Object.keys(condition);
    for (const group of groups) {
      if (!["all", "any", "not"].includes(group)) throw new SyntaxError(`Unknown condition group: ${group}`);
    }
    const all = condition.all === undefined || evaluate(condition.all, world);
    const any = condition.any === undefined || [].concat(condition.any).some((item) => evaluate(item, world));
    const not = condition.not === undefined || ![].concat(condition.not).some((item) => evaluate(item, world));
    return all && any && not;
  }
  throw new TypeError(`A condition cannot be ${typeof condition}.`);
}

/**
 * Fills {placeholders} in UI text. `{state.trust}` shows a value, and
 * `{flag.gate-open ? Open : Secured}` picks text by a condition.
 */
export function interpolate(text, world = {}) {
  return String(text ?? "").replace(/\{([^{}]+)\}/g, (_match, body) => {
    const choice = body.match(/^(.+?)\s+\?\s+(.*?)\s+:\s+(.*)$/);
    if (choice) return evaluate(choice[1], world) ? choice[2] : choice[3];
    const value = readPath(world, body.trim());
    return value === undefined || value === null ? "" : String(value);
  });
}
