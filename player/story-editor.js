// The story editor: scenes (timelines, like Dialogic's) made of blocks, edited
// in the game. Opened from the screen editor (Cmd+E → Story). Scenes are saved
// as story/<id>.json in the game folder; js/engine/story.js plays them.
//
// Left: the scenes, and the blocks to add. Middle: the scene, top to bottom;
// drag a block to move it. Right: the settings of the selected block (or of
// the scene, when nothing is selected).

import { parseCondition } from "/js/engine/conditions.js";
import { allBlocks, checkScene } from "/js/engine/story.js";

const BLOCKS = {
  line: { name: "Line", mark: "❝", hint: "Someone says something" },
  narrate: { name: "Narration", mark: "¶", hint: "What happens, in the story's voice" },
  choice: { name: "Choice", mark: "⑂", hint: "Buttons for the player, each with its own branch" },
  if: { name: "If / else", mark: "?", hint: "Two branches, picked by a condition" },
  set: { name: "Set", mark: "=", hint: "Change a mood, a flag, a counter or an item" },
  talk: { name: "Free talk", mark: "⌨", hint: "The player types; the AI answers, until a condition holds" },
  label: { name: "Label", mark: "#", hint: "A place to jump to" },
  jump: { name: "Jump", mark: "↷", hint: "Go to a label" },
  end: { name: "End", mark: "■", hint: "End the scene" }
};

const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...[].concat(children).filter((child) => child !== null && child !== undefined && child !== false));
  return node;
};
const button = (text, onClick, extra = {}) => el("button", { type: "button", textContent: text, onclick: onClick, ...extra });
const uid = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 7)}`;
const slugOf = (text) => String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The lists inside a block, with a key for each (an option's id, "then", "else"). */
function innerLists(block) {
  if (block.type === "choice") return (block.options ?? []).map((option) => [option.id, (option.events ??= [])]);
  if (block.type === "if") return [["then", (block.then ??= [])], ["else", (block.else ??= [])]];
  return [];
}

/** Finds a block: the list it is in, its index, and the block. */
function locate(events, id) {
  for (let index = 0; index < events.length; index += 1) {
    if (events[index].id === id) return { list: events, index, block: events[index] };
    for (const [, list] of innerLists(events[index])) {
      const found = locate(list, id);
      if (found) return found;
    }
  }
  return null;
}

export function createStoryEditor({ session, host, reloadVault, onPlay = () => {}, onClose = () => {} }) {
  let open = false;
  let scenes = {};
  let current = null;
  let selected = null; // { block: id } | { owner: id, key } (a branch, to add into) | null
  let dirty = new Set();
  let removed = new Set();
  let links = new Map(); // object id → scene id (or null): which scene a click on it starts
  let undo = [];
  let redo = [];
  let status = "";
  let dragging = null;
  let lastSave = null;

  const root = el("div", { className: "story-editor", hidden: true });
  document.body.append(root);

  // ---------------------------------------------------------------- what the game has

  const vault = () => session.vault;
  const notesOf = (type) => Object.entries(vault().notes).filter(([, note]) => note.type === type).map(([id, note]) => ({ id, ...note }));
  const characters = () => notesOf("character");
  const nameOf = (id) => (id === "player" ? "Elena (you)" : vault().notes[id]?.props.name ?? id);
  const moodsOf = (id) => ["neutral", ...new Set([].concat(vault().notes[id]?.blocks.Tones ?? []).map((row) => row?.tone).filter((tone) => tone && tone !== "neutral"))];
  const stateKeysOf = (id) => Object.keys(vault().notes[id]?.blocks.State ?? {});
  const flags = () => [...new Set([...(vault().notes.Game?.blocks.Variables?.flags ?? []), ...Object.keys(session.world?.flag ?? {})])];
  const scene = () => scenes[current];

  /** Words a condition can use, for the suggestion list. */
  function conditionWords() {
    const who = scene()?.with;
    return [
      ...flags().map((flag) => `flag.${flag}`),
      ...flags().map((flag) => `not flag.${flag}`),
      ...stateKeysOf(who).flatMap((key) => [`state.${key} > 50`, `state.${key} < 30`]),
      ...Object.keys(vault().notes.Game?.blocks.Variables?.counters ?? {}).map((counter) => `counter.${counter} >= 1`),
      ...notesOf("item").map((item) => `item.${item.id} = held`),
      ...characters().map((character) => `talk.${slugOf(character.id)} = success`)
    ];
  }

  // ---------------------------------------------------------------- changes and undo

  function change(label, apply) {
    const id = current;
    const before = JSON.stringify(scenes[id]);
    apply();
    const after = JSON.stringify(scenes[id]);
    if (before === after) return render();
    undo.push({ id, label, before, after });
    redo = [];
    dirty.add(id);
    status = "";
    render();
  }

  function restore(step, which) {
    scenes[step.id] = JSON.parse(step[which]);
    current = step.id;
    dirty.add(step.id);
    if (selected?.block && !locate(scene().events, selected.block)) selected = null;
    render();
  }
  const doUndo = () => { const step = undo.pop(); if (step) { redo.push(step); restore(step, "before"); } };
  const doRedo = () => { const step = redo.pop(); if (step) { undo.push(step); restore(step, "after"); } };

  function newBlock(type) {
    const who = scene().with ?? characters()[0]?.id;
    const block = { id: uid(type), type };
    if (type === "line") Object.assign(block, { who, mood: "neutral", text: "" });
    if (type === "narrate") block.text = "";
    if (type === "choice") block.options = [{ id: uid("option"), text: "", events: [] }, { id: uid("option"), text: "", events: [] }];
    if (type === "if") Object.assign(block, { if: "", then: [], else: [] });
    if (type === "set") Object.assign(block, { who, effect: "" });
    if (type === "talk") Object.assign(block, { who, until: "" });
    if (type === "label") block.name = `part-${allBlocks(scene().events).filter((item) => item.type === "label").length + 1}`;
    if (type === "jump") block.to = allBlocks(scene().events).find((item) => item.type === "label")?.name ?? "";
    if (type === "end") block.then = "close";
    return block;
  }

  /** The list a branch target means. */
  function branchList(target) {
    const owner = locate(scene().events, target.owner)?.block;
    return owner ? innerLists(owner).find(([key]) => key === target.key)?.[1] ?? null : null;
  }

  /** Adds a block after the selected one, into the selected branch, or at the end. */
  function addBlock(type) {
    if (!scene()) return;
    const block = newBlock(type);
    change(`Add ${BLOCKS[type].name}`, () => {
      const at = selected?.block && locate(scene().events, selected.block);
      if (at) at.list.splice(at.index + 1, 0, block);
      else if (selected?.owner && branchList(selected)) branchList(selected).push(block);
      else scene().events.push(block);
      selected = { block: block.id };
    });
  }

  function removeBlock(id) {
    change("Remove a block", () => {
      const at = locate(scene().events, id);
      if (at) at.list.splice(at.index, 1);
      selected = null;
    });
  }

  function duplicateBlock(id) {
    change("Duplicate a block", () => {
      const at = locate(scene().events, id);
      if (!at) return;
      const copy = structuredClone(at.block);
      const renew = (block) => {
        block.id = uid(block.type);
        if (block.type === "label") block.name = `${block.name}-copy`;
        for (const option of block.options ?? []) option.id = uid("option");
        for (const [, list] of innerLists(block)) list.forEach(renew);
      };
      renew(copy);
      at.list.splice(at.index + 1, 0, copy);
      selected = { block: copy.id };
    });
  }

  /** Moves a block before another block, or to the end of a list. */
  function moveBlock(id, target) {
    change("Move a block", () => {
      const from = locate(scene().events, id);
      if (!from) return;
      // Not into itself.
      if (target.before && locate(innerLists(from.block).flatMap(([, list]) => list), target.before)) return;
      if (target.before === id) return;
      if (target.owner && (target.owner === id || locate(innerLists(from.block).flatMap(([, list]) => list), target.owner))) return;
      from.list.splice(from.index, 1);
      if (target.before) {
        const to = locate(scene().events, target.before);
        to.list.splice(to.index, 0, from.block);
      } else {
        const list = target.owner ? branchList(target) : scene().events;
        list.push(from.block);
      }
      selected = { block: id };
    });
  }

  // ---------------------------------------------------------------- scenes

  function load() {
    scenes = structuredClone(vault().story ?? {});
    dirty = new Set();
    removed = new Set();
    links = new Map();
    undo = [];
    redo = [];
    if (!scenes[current]) current = Object.keys(scenes)[0] ?? null;
  }

  function newScene(title, who) {
    const id = slugOf(title);
    if (!id) return fail("Give the scene a name.");
    if (scenes[id]) return fail(`There is already a scene called ${id}.`);
    scenes[id] = { id, title: title.trim(), with: who, events: [{ id: uid("line"), type: "line", who, mood: "neutral", text: "" }] };
    removed.delete(id);
    dirty.add(id);
    current = id;
    selected = { block: scenes[id].events[0].id };
    status = `New scene ${id}. Write its first line.`;
    render();
  }

  function deleteScene() {
    if (!scene() || !confirm(`Delete the scene "${scene().title ?? current}"? Saving makes it final.`)) return;
    removed.add(current);
    dirty.delete(current);
    delete scenes[current];
    current = Object.keys(scenes)[0] ?? null;
    selected = null;
    render();
  }

  function fail(text) {
    status = text;
    render();
  }

  async function save(force = false) {
    if (!host?.saveEdits) return fail("Saving works in the desktop app (npm run app).");
    const files = {};
    for (const id of dirty) files[scenes[id].path ?? `story/${id}.json`] = scenes[id];
    for (const id of removed) files[vault().story?.[id]?.path ?? `story/${id}.json`] = null;
    const notes = {};
    for (const [objectId, sceneId] of links) {
      const path = vault().notes[objectId]?.path;
      if (path) notes[path] = { boxes: [], props: { scene: sceneId } };
    }
    const builtAt = vault().builtAt;
    const result = await host.saveEdits({ scenes: files, notes, canvases: {}, since: lastSave && lastSave > builtAt ? lastSave : builtAt, force });
    if (result.error) return fail(`Could not save: ${result.error}`);
    if (result.conflicts?.length) {
      status = `${result.conflicts.join(", ")} changed on disk since you opened the story editor.`;
      render();
      root.querySelector(".story-head")?.append(button("Save anyway", () => save(true), { className: "danger" }));
      return;
    }
    lastSave = new Date().toISOString();
    await reloadVault?.();
    const keep = current;
    load();
    current = scenes[keep] ? keep : current;
    status = `Saved ${result.saved.length} file${result.saved.length === 1 ? "" : "s"}.`;
    render();
  }

  function play() {
    if (!scene()) return;
    // Plays this copy, saved or not.
    session.vault.story = { ...(session.vault.story ?? {}), [current]: structuredClone(scene()) };
    const from = selected?.block ?? null;
    close();
    onPlay(current, from);
  }

  // ---------------------------------------------------------------- drawing

  function render() {
    if (!open) return;
    root.replaceChildren(head(), el("div", { className: "story-main" }, [left(), middle(), right()]));
  }

  function head() {
    const pending = dirty.size + removed.size + links.size;
    return el("div", { className: "story-head" }, [
      el("strong", { textContent: "Story" }),
      el("span", { className: "story-where", textContent: scene() ? `${scene().title ?? current} · with ${nameOf(scene().with)}` : "No scene yet" }),
      el("span", { className: "story-status", textContent: status }),
      button("Undo", doUndo, { disabled: !undo.length }),
      button("Redo", doRedo, { disabled: !redo.length }),
      button(selected?.block ? "▶ Play from here" : "▶ Play", play, { disabled: !scene() }),
      button(pending ? `Save (${pending})` : "Saved", () => save(), { disabled: !pending, className: "primary" }),
      button("Close", close)
    ]);
  }

  function left() {
    const list = el("div", { className: "story-scenes" }, Object.values(scenes).map((item) => button(`${item.title ?? item.id}`, () => {
      current = item.id;
      selected = null;
      render();
    }, { className: item.id === current ? "on" : "", title: `with ${nameOf(item.with)}${dirty.has(item.id) ? " · not saved" : ""}` })));
    const title = el("input", { placeholder: "New scene name" });
    const who = el("select", {}, characters().map((character) => el("option", { value: character.id, textContent: nameOf(character.id) })));
    const make = button("＋ New scene", () => newScene(title.value, who.value));
    title.onkeydown = (event) => event.key === "Enter" && make.click();
    const add = el("div", { className: "story-palette" }, Object.entries(BLOCKS).map(([type, info]) => button(`${info.mark}  ${info.name}`, () => addBlock(type), { title: info.hint, disabled: !scene() })));
    return el("div", { className: "story-left" }, [
      el("h3", { textContent: "Scenes" }), list,
      el("div", { className: "story-new" }, [title, who, make]),
      el("h3", { textContent: "Add" }),
      el("p", { className: "story-hint", textContent: selected?.owner ? "Adds into the selected branch." : selected?.block ? "Adds after the selected block." : "Adds at the end." }),
      add
    ]);
  }

  function middle() {
    if (!scene()) return el("div", { className: "story-timeline" }, [el("p", { className: "story-hint", textContent: "Make a scene on the left to start." })]);
    return el("div", { className: "story-timeline", onclick: (event) => {
      if (event.target === event.currentTarget) {
        selected = null;
        render();
      }
    } }, [blockList(scene().events, null)]);
  }

  /** A list of blocks, with a drop zone and an add-here button at its end. */
  function blockList(list, branch) {
    const isTarget = branch && selected?.owner === branch.owner && selected?.key === branch.key;
    const end = el("div", {
      className: `story-end${isTarget ? " on" : ""}`,
      textContent: branch ? (list.length ? "＋ add here" : "Empty. Click, then add a block.") : "＋ add at the end",
      onclick: (event) => {
        event.stopPropagation();
        selected = branch ?? null;
        render();
      }
    });
    dropTarget(end, () => (branch ? { owner: branch.owner, key: branch.key } : { end: true }));
    return el("div", { className: "story-list" }, [...list.map((block) => blockView(block)), end]);
  }

  function dropTarget(node, where) {
    node.addEventListener("dragover", (event) => {
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
      node.classList.add("drop");
    });
    node.addEventListener("dragleave", () => node.classList.remove("drop"));
    node.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      node.classList.remove("drop");
      if (dragging) moveBlock(dragging, where());
      dragging = null;
    });
  }

  function blockView(block) {
    const info = BLOCKS[block.type] ?? { name: block.type, mark: "·" };
    const body = el("div", { className: "story-body" });
    const put = (...children) => body.append(...children.filter(Boolean));
    if (block.type === "line") {
      put(
        el("span", { className: "story-who", textContent: nameOf(block.who ?? scene().with) }),
        block.mood && block.mood !== "neutral" ? el("span", { className: "story-mood", textContent: block.mood }) : null,
        el("div", { className: "story-text", textContent: block.text || "(no text yet)" })
      );
    } else if (block.type === "narrate") {
      put(el("div", { className: "story-text story-narrate", textContent: block.text || "(no text yet)" }));
    } else if (block.type === "choice") {
      put(el("div", { className: "story-kind", textContent: "Choice" }));
      for (const option of block.options ?? []) {
        put(el("div", { className: "story-option" }, [
          el("div", { className: "story-option-text" }, [`"${option.text || "…"}"`, option.if ? el("span", { className: "story-cond", textContent: ` if ${option.if}` }) : null]),
          blockList((option.events ??= []), { owner: block.id, key: option.id })
        ]));
      }
    } else if (block.type === "if") {
      put(
        el("div", { className: "story-kind", textContent: `If ${block.if || "(no condition)"}` }),
        el("div", { className: "story-option" }, [blockList((block.then ??= []), { owner: block.id, key: "then" })]),
        el("div", { className: "story-kind", textContent: "Else" }),
        el("div", { className: "story-option" }, [blockList((block.else ??= []), { owner: block.id, key: "else" })])
      );
    } else {
      const text = {
        set: () => `Set: ${block.effect || "(nothing yet)"}${block.who && /^state /.test(block.effect ?? "") ? ` (${nameOf(block.who)})` : ""}`,
        talk: () => `Free talk with ${nameOf(block.who ?? scene().with)}${block.until ? ` until ${block.until}` : ", until they end it"}`,
        label: () => `Label: ${block.name}`,
        jump: () => `Jump to ${block.to || "(choose a label)"}`,
        end: () => `End${block.outcome ? `: ${block.outcome}` : ""} · then ${block.then === "talk" ? "keep talking" : "close the talk"}`
      }[block.type];
      put(el("div", { className: "story-kind", textContent: text ? text() : block.type }));
    }
    const isSelected = selected?.block === block.id;
    const row = el("div", {
      className: `story-block story-${block.type}${isSelected ? " selected" : ""}`,
      draggable: true,
      onclick: (event) => {
        event.stopPropagation();
        selected = { block: block.id };
        render();
      }
    }, [el("span", { className: "story-mark", textContent: info.mark, title: `${info.name} · drag to move` }), body]);
    row.addEventListener("dragstart", (event) => {
      event.stopPropagation();
      dragging = block.id;
      event.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => (dragging = null));
    dropTarget(row, () => ({ before: block.id }));
    return row;
  }

  // ---------------------------------------------------------------- settings

  function field(label, input, hint) {
    return el("label", { className: "story-field" }, [el("span", { textContent: label }), input, hint ? el("small", { textContent: hint }) : null]);
  }
  const select = (options, value, onChange) => {
    const input = el("select", {}, options.map(([optionValue, text]) => el("option", { value: optionValue, textContent: text, selected: optionValue === value })));
    input.onchange = () => onChange(input.value);
    return input;
  };
  const text = (value, onChange, { multiline = false, placeholder = "" } = {}) => {
    const input = el(multiline ? "textarea" : "input", { value: value ?? "", placeholder, rows: multiline ? 4 : undefined });
    input.onchange = () => onChange(input.value);
    return input;
  };

  /** A condition box: suggestions as you type, and a mark that says if it reads. */
  function condition(value, onChange, placeholder = "always") {
    const input = el("input", { value: value ?? "", placeholder });
    input.setAttribute("list", "story-conditions");
    const mark = el("small", {});
    const check = () => {
      const textValue = input.value.trim();
      if (!textValue) return (mark.textContent = "");
      try {
        parseCondition(textValue);
        mark.textContent = "✓ reads fine";
        mark.className = "ok";
      } catch (error) {
        mark.textContent = `✗ ${error.message}`;
        mark.className = "bad";
      }
    };
    input.oninput = check;
    input.onchange = () => onChange(input.value.trim());
    check();
    return el("div", { className: "story-condition" }, [input, mark]);
  }

  function right() {
    const panel = el("div", { className: "story-settings" });
    panel.append(el("datalist", { id: "story-conditions" }, conditionWords().map((word) => el("option", { value: word }))));
    if (!scene()) return panel;
    const at = selected?.block && locate(scene().events, selected.block);
    if (!at) {
      panel.append(...sceneSettings());
      return panel;
    }
    const block = at.block;
    const set = (label, apply) => change(label, () => apply(block));
    const people = [...characters().map((character) => [character.id, nameOf(character.id)])];
    panel.append(el("h3", { textContent: BLOCKS[block.type]?.name ?? block.type }), el("p", { className: "story-hint", textContent: BLOCKS[block.type]?.hint ?? "" }));

    if (block.type === "line") {
      const who = block.who ?? scene().with;
      panel.append(
        field("Who", select([...people, ["player", "Elena (you)"]], who, (value) => set("Change who speaks", (item) => {
          item.who = value;
          if (!moodsOf(value).includes(item.mood)) item.mood = "neutral";
        }))),
        who === "player" ? null : field("Mood", select(moodsOf(who).map((mood) => [mood, mood]), block.mood ?? "neutral", (value) => set("Change the mood", (item) => (item.mood = value))), "Their face and talking loop follow it."),
        field("Text", text(block.text, (value) => set("Change the line", (item) => (item.text = value)), { multiline: true }))
      );
    }
    if (block.type === "narrate") panel.append(field("Text", text(block.text, (value) => set("Change the narration", (item) => (item.text = value)), { multiline: true })));
    if (block.type === "choice") {
      (block.options ?? []).forEach((option, index) => {
        panel.append(el("div", { className: "story-option-edit" }, [
          field(`Option ${index + 1}`, text(option.text, (value) => set("Change an option", (item) => (item.options[index].text = value)), { placeholder: "What the player says" })),
          field("Show only if", condition(option.if, (value) => set("Change when an option shows", (item) => {
            if (value) item.options[index].if = value;
            else delete item.options[index].if;
          }))),
          el("div", { className: "story-row" }, [
            button("▲", () => set("Move an option", (item) => index > 0 && item.options.splice(index - 1, 0, ...item.options.splice(index, 1))), { disabled: index === 0 }),
            button("▼", () => set("Move an option", (item) => item.options.splice(index + 1, 0, ...item.options.splice(index, 1))), { disabled: index === block.options.length - 1 }),
            button("Remove", () => set("Remove an option", (item) => item.options.splice(index, 1)), { className: "danger" })
          ])
        ]));
      });
      panel.append(button("＋ Add an option", () => set("Add an option", (item) => item.options.push({ id: uid("option"), text: "", events: [] }))));
    }
    if (block.type === "if") panel.append(field("Condition", condition(block.if, (value) => set("Change the condition", (item) => (item.if = value)), "a condition, such as flag.saw-sketch")));
    if (block.type === "set") panel.append(...effectFields(block, set, people));
    if (block.type === "talk") {
      panel.append(
        field("With", select(people, block.who ?? scene().with, (value) => set("Change who talks", (item) => (item.who = value)))),
        field("Until", condition(block.until, (value) => set("Change when the talk ends", (item) => (item.until = value)), "they end it themselves"), "When this holds after a turn, the scene goes on.")
      );
    }
    if (block.type === "label") {
      panel.append(field("Name", text(block.name, (value) => set("Rename a label", (item) => {
        const name = slugOf(value) || item.name;
        // Jumps to it follow the new name.
        for (const jump of allBlocks(scene().events)) if (jump.type === "jump" && jump.to === item.name) jump.to = name;
        item.name = name;
      }))));
    }
    if (block.type === "jump") {
      const labels = allBlocks(scene().events).filter((item) => item.type === "label").map((item) => item.name);
      panel.append(field("Go to", select([["", "(choose a label)"], ...labels.map((name) => [name, name])], block.to ?? "", (value) => set("Change a jump", (item) => (item.to = value))), labels.length ? "" : "Add a Label block first."));
    }
    if (block.type === "end") {
      const outcomes = notesOf("outcome").map((outcome) => [outcome.id, outcome.props.title ?? outcome.id]);
      panel.append(
        field("Then", select([["close", "Close the talk"], ["talk", "Keep talking freely"]], block.then ?? "close", (value) => set("Change how it ends", (item) => (item.then = value)))),
        field("Ending", select([["", "(none: the game goes on)"], ...outcomes], block.outcome ?? "", (value) => set("Change the ending", (item) => {
          if (value) item.outcome = value;
          else delete item.outcome;
        })), "An ending can end the game.")
      );
    }
    panel.append(el("div", { className: "story-row" }, [
      button("▶ Play from here", play),
      button("Duplicate", () => duplicateBlock(block.id)),
      button("Delete", () => removeBlock(block.id), { className: "danger" })
    ]));
    return panel;
  }

  /** A set block, built from lists instead of typed: what to change, and how. */
  function effectFields(block, set, people) {
    const effect = block.effect ?? "";
    const kind = effect.match(/^(state|flag|counter|item|screen)\b/)?.[1] ?? (effect ? "other" : "state");
    const parts = effect.split(/\s+/);
    const write = (value) => set("Change a Set block", (item) => (item.effect = value));
    const rows = [field("Change", select([["state", "A mood (state)"], ["flag", "A flag"], ["counter", "A counter"], ["item", "An item"], ["screen", "Go to a screen"], ["other", "Something else (type it)"]], kind, (value) => {
      const first = { state: `state ${stateKeysOf(block.who ?? scene().with)[0] ?? "trust"} +10`, flag: `flag ${flags()[0] ?? "new-flag"}`, counter: "counter turns +1", item: `item ${notesOf("item")[0]?.id ?? "item"} held`, screen: `screen ${Object.keys(vault().world ?? {})[0] ?? ""}`, other: "" }[value];
      write(first);
    }))];
    if (kind === "state") {
      const who = block.who ?? scene().with;
      const keys = stateKeysOf(who);
      const [, key = keys[0], amount = "+10"] = parts;
      const sign = amount.startsWith("-") ? "-" : amount.startsWith("+") ? "+" : "=";
      const size = amount.replace(/^[-+=]/, "") || "10";
      rows.push(
        field("Whose", select(people, who, (value) => set("Change whose mood", (item) => {
          item.who = value;
          item.effect = `state ${stateKeysOf(value)[0] ?? key} ${amount}`;
        }))),
        field("Mood", select(keys.map((item) => [item, item]), key, (value) => write(`state ${value} ${amount}`))),
        el("div", { className: "story-row" }, [
          select([["+", "up by"], ["-", "down by"], ["=", "set to"]], sign, (value) => write(`state ${key} ${value === "=" ? "" : value}${size}`)),
          text(size, (value) => write(`state ${key} ${sign === "=" ? "" : sign}${Number(value) || 0}`))
        ])
      );
    } else if (kind === "flag") {
      const [, name = "", onOff = "on"] = parts;
      const box = el("input", { value: name, placeholder: "flag name" });
      box.setAttribute("list", "story-flags");
      box.onchange = () => write(`flag ${slugOf(box.value)}${onOff === "off" ? " off" : ""}`);
      rows.push(el("datalist", { id: "story-flags" }, flags().map((flag) => el("option", { value: flag }))), field("Flag", box), field("To", select([["on", "on"], ["off", "off"]], onOff === "off" ? "off" : "on", (value) => write(`flag ${name}${value === "off" ? " off" : ""}`))));
    } else if (kind === "counter") {
      const [, name = "", amount = "+1"] = parts;
      rows.push(field("Counter", text(name, (value) => write(`counter ${slugOf(value)} ${amount}`))), field("By", text(amount, (value) => write(`counter ${name} ${value}`)), "+1, -1, or a number to set"));
    } else if (kind === "item") {
      const [, id = "", how = "held"] = parts;
      rows.push(field("Item", select(notesOf("item").map((item) => [item.id, item.props.name ?? item.id]), id, (value) => write(`item ${value} ${how}`))), field("Now", select([["held", "held"], ["shown", "shown"], ["gone", "gone"]], how, (value) => write(`item ${id} ${value}`))));
    } else if (kind === "screen") {
      rows.push(field("Screen", select(Object.keys(vault().world ?? {}).map((id) => [id, id]), parts[1] ?? "", (value) => write(`screen ${value}`))));
    } else {
      rows.push(field("Effect", text(effect, (value) => write(value.trim()), { placeholder: "an effect, such as flag lamp-on" })));
    }
    return rows;
  }

  /** Nothing selected: the scene's own settings, and its problems. */
  function sceneSettings() {
    const item = scene();
    const objects = notesOf("object").filter((object) => object.props.conversation === item.with || (links.get(object.id) ?? object.props.scene) === current);
    const linked = objects.find((object) => (links.has(object.id) ? links.get(object.id) : object.props.scene) === current)?.id ?? "";
    const problems = checkScene(item, {
      characters: characters().map((character) => character.id),
      moods: Object.fromEntries(characters().map((character) => [character.id, moodsOf(character.id)])),
      outcomes: notesOf("outcome").map((outcome) => outcome.id)
    }).map((problem) => problem.replace(`${item.id}: `, ""));
    return [
      el("h3", { textContent: "Scene" }),
      field("Name", text(item.title ?? item.id, (value) => change("Rename the scene", () => (item.title = value.trim() || item.id)))),
      field("With", select(characters().map((character) => [character.id, nameOf(character.id)]), item.with, (value) => change("Change who the scene is with", () => (item.with = value))), "Whose portrait, voice and free talk it uses."),
      field("Starts when you click", select([["", "(nothing: start it from an effect)"], ...objects.map((object) => [object.id, object.props.label ?? object.props.name ?? object.id])], linked, (value) => {
        if (linked && linked !== value) links.set(linked, null);
        if (value) links.set(value, current);
        render();
      }), "It plays the first time; after that they talk freely."),
      el("h3", { textContent: problems.length ? `${problems.length} problem${problems.length === 1 ? "" : "s"}` : "No problems" }),
      el("ul", { className: "story-problems" }, problems.map((problem) => el("li", { textContent: problem }))),
      button("Delete this scene", deleteScene, { className: "danger" })
    ];
  }

  // ---------------------------------------------------------------- open / close

  function show() {
    open = true;
    root.hidden = false;
    load();
    status = "";
    render();
  }

  function close() {
    if (!open) return;
    open = false;
    root.hidden = true;
    onClose();
  }

  window.addEventListener("keydown", (event) => {
    if (!open) return;
    const typing = event.target.closest?.("input, textarea, select");
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "s") {
      event.preventDefault();
      save();
    } else if (mod && event.key.toLowerCase() === "z" && !typing) {
      event.preventDefault();
      event.shiftKey ? doRedo() : doUndo();
    } else if (event.key === "Escape" && !typing) {
      event.preventDefault();
      if (selected) {
        selected = null;
        render();
      } else close();
    } else if ((event.key === "Delete" || event.key === "Backspace") && !typing && selected?.block) {
      event.preventDefault();
      removeBlock(selected.block);
    }
  }, true);

  return {
    get open() { return open; },
    get dirty() { return dirty.size + removed.size + links.size > 0; },
    show,
    close
  };
}
