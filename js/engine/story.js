// Scenes: the story editor's timelines (like Dialogic's), played block by block.
//
// A scene is a JSON file in the game's story/ folder:
//
//   { "id": "chloe-sketch", "title": "Chloe · the sketch", "with": "Chloe",
//     "events": [ ...blocks... ] }
//
// Blocks (each has an `id`, unique in the scene, for the editor):
//   line     { who, mood, text }        who: a character id, or "player"
//   narrate  { text }
//   choice   { options: [{ id, text, if, events }] }   buttons; `if` hides one
//   if       { if, then: [...], else: [...] }
//   set      { effect, who }            an effect: "flag saw-sketch", "state trust +10"
//   label    { name }
//   jump     { to }                     a label anywhere in the scene
//   talk     { who, until }             free typing with the AI until `until` holds
//   end      { outcome, then }          then: "close" (the talk panel) or "talk"
//
// SceneRunner walks the blocks; the game shows what it returns and calls back.
// It does not know about screens, portraits or voices: the session does.

import { parseCondition, evaluate } from "./conditions.js";
import { parseEffect } from "./effects.js";

export const BLOCK_TYPES = ["line", "narrate", "choice", "if", "set", "label", "jump", "talk", "end"];

/** The lists of blocks inside a block (a choice's options, an if's branches). */
function childLists(event) {
  if (event.type === "choice") return (event.options ?? []).map((option) => option.events ?? []);
  if (event.type === "if") return [event.then ?? [], event.else ?? []];
  return [];
}

/**
 * Where a block is: the frames to resume from it (innermost last). Each frame
 * is { events, index }; outer frames point just past the block that holds the
 * inner list, so a branch that runs out carries on after its choice or if.
 */
function pathTo(events, match, frames = []) {
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (match(event)) return [...frames, { events, index }];
    for (const list of childLists(event)) {
      const found = pathTo(list, match, [...frames, { events, index: index + 1 }]);
      if (found) return found;
    }
  }
  return null;
}

/** Every block in a scene, depth first. */
export function allBlocks(events = []) {
  return events.flatMap((event) => [event, ...childLists(event).flatMap(allBlocks)]);
}

export class SceneRunner {
  /**
   * @param scene the scene data
   * @param view () => the world conditions read (flags, state, …)
   * @param apply (effect, who) => runs a `set` block's effect
   */
  constructor(scene, { view = () => ({}), apply = () => {} } = {}) {
    this.scene = scene;
    this.view = view;
    this.apply = apply;
    this.frames = [];
    this.waiting = null; // the talk or choice block being waited on
    this.done = false;
  }

  /** Starts at the top, or at the block with this id (Play from here). */
  start(blockId = null) {
    const events = this.scene.events ?? [];
    this.frames = (blockId && pathTo(events, (event) => event.id === blockId)) || [{ events, index: 0 }];
    this.waiting = null;
    this.done = false;
    return this.step();
  }

  /** Goes on to the next block that shows something, running the rest on the way. */
  step() {
    this.waiting = null;
    for (let guard = 0; guard < 1000; guard += 1) {
      const frame = this.frames.at(-1);
      if (!frame) return this.finish({ type: "end", outcome: null, then: "close" });
      if (frame.index >= frame.events.length) {
        this.frames.pop();
        continue;
      }
      const event = frame.events[frame.index];
      frame.index += 1;
      switch (event.type) {
        case "line":
          return { type: "line", who: event.who ?? this.scene.with, mood: event.mood || "neutral", text: String(event.text ?? ""), id: event.id };
        case "narrate":
          return { type: "narrate", text: String(event.text ?? ""), id: event.id };
        case "choice": {
          const options = (event.options ?? [])
            .map((option, index) => ({ index, text: option.text, when: option.if }))
            .filter((option) => option.text && (!option.when || this.holds(option.when)));
          if (!options.length) continue;
          this.waiting = event;
          return { type: "choice", options: options.map(({ index, text }) => ({ index, text })), id: event.id };
        }
        case "if": {
          const list = this.holds(event.if) ? event.then : event.else;
          if (list?.length) this.frames.push({ events: list, index: 0 });
          continue;
        }
        case "set":
          if (event.effect) this.apply(event.effect, event.who ?? this.scene.with);
          continue;
        case "jump": {
          const path = pathTo(this.scene.events ?? [], (item) => item.type === "label" && item.name === event.to);
          if (!path) throw new Error(`No label "${event.to}" in scene ${this.scene.id}`);
          path.at(-1).index += 1;
          this.frames = path;
          continue;
        }
        case "talk":
          // Already done (its condition holds): no need to talk.
          if (event.until && this.holds(event.until)) continue;
          this.waiting = event;
          return { type: "talk", who: event.who ?? this.scene.with, until: event.until ?? null, id: event.id };
        case "end":
          return this.finish({ type: "end", outcome: event.outcome ?? null, then: event.then ?? "close", id: event.id });
        default:
          continue; // a label, or a block this version does not know
      }
    }
    throw new Error(`Scene ${this.scene.id} jumps in a loop`);
  }

  /** The player picked option `index` of the choice being waited on. */
  choose(index) {
    const event = this.waiting;
    if (event?.type !== "choice") throw new Error("No choice is waiting");
    const option = event.options?.[index];
    if (!option) throw new Error(`No option ${index}`);
    if (option.events?.length) this.frames.push({ events: option.events, index: 0 });
    return { text: option.text, next: this.step() };
  }

  /** In a talk block: true once its `until` holds (then call step()). No `until`: never by itself. */
  talkDone() {
    return this.waiting?.type === "talk" && Boolean(this.waiting.until) && this.holds(this.waiting.until);
  }

  holds(condition) {
    try {
      return evaluate(condition ?? null, this.view());
    } catch {
      return false;
    }
  }

  finish(result) {
    this.done = true;
    this.frames = [];
    return result;
  }
}

/**
 * Problems with a scene, for the vault check and the editor.
 * @param known.characters character ids; known.moods { id: [mood] };
 *   known.outcomes outcome ids
 */
export function checkScene(scene, { characters = [], moods = {}, outcomes = [] } = {}) {
  const problems = [];
  const where = scene.id ?? "scene";
  const blocks = allBlocks(scene.events ?? []);
  const labels = blocks.filter((event) => event.type === "label").map((event) => event.name);
  const ids = blocks.map((event) => event.id).filter(Boolean);
  const condition = (text, what) => {
    if (!text) return;
    try {
      parseCondition(text);
    } catch (error) {
      problems.push(`${where}: ${what}: bad condition "${text}" (${error.message})`);
    }
  };
  const person = (who, what) => {
    if (who && who !== "player" && !characters.includes(who)) problems.push(`${where}: ${what}: no character "${who}"`);
  };
  if (scene.with) person(scene.with, "with");
  for (const label of new Set(labels)) if (labels.filter((name) => name === label).length > 1) problems.push(`${where}: two labels named "${label}"`);
  for (const id of new Set(ids)) if (ids.filter((item) => item === id).length > 1) problems.push(`${where}: two blocks with id "${id}"`);
  for (const event of blocks) {
    const what = `${event.type} ${event.id ?? ""}`.trim();
    if (!BLOCK_TYPES.includes(event.type)) problems.push(`${where}: unknown block type "${event.type}"`);
    if (event.type === "line") {
      person(event.who, what);
      const who = event.who ?? scene.with;
      if (event.mood && event.mood !== "neutral" && moods[who] && !moods[who].includes(event.mood)) problems.push(`${where}: ${what}: ${who} has no mood "${event.mood}"`);
      if (!String(event.text ?? "").trim()) problems.push(`${where}: ${what}: a line with no text`);
    }
    if (event.type === "choice") {
      if (!(event.options ?? []).some((option) => String(option.text ?? "").trim())) problems.push(`${where}: ${what}: a choice with no options`);
      for (const option of event.options ?? []) condition(option.if, `${what} option "${option.text}"`);
    }
    if (event.type === "if") condition(event.if, what);
    if (event.type === "talk") {
      person(event.who, what);
      condition(event.until, what);
    }
    if (event.type === "set") {
      try {
        parseEffect(event.effect);
      } catch (error) {
        problems.push(`${where}: ${what}: bad effect "${event.effect}" (${error.message})`);
      }
    }
    if (event.type === "jump" && !labels.includes(event.to)) problems.push(`${where}: ${what}: no label "${event.to}"`);
    if (event.type === "end" && event.outcome && !outcomes.includes(event.outcome)) problems.push(`${where}: ${what}: no outcome "${event.outcome}"`);
  }
  return problems;
}
