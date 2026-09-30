import assert from "node:assert/strict";
import test from "node:test";
import { evaluate, interpolate, parseCondition } from "../js/engine/conditions.js";
import { applyEffects, parseEffect } from "../js/engine/effects.js";
import { buildWorld } from "../js/engine/canvas-world.js";
import { resolveUi } from "../js/engine/ui.js";
import { compileVault } from "../scripts/compile-vault.mjs";

const world = {
  state: { trust: 40, suspicion: 80 },
  flag: { "gate-open": false, "reason-asked": true },
  counter: { refusals: 6 },
  item: { "contractor-id": "shown" },
  profile: { trustThreshold: 55, label: "Terse Eastern European" },
  memories: [
    { tags: ["threat"], createdTurn: 1 },
    { tags: ["repair"], createdTurn: 2 },
    { tags: ["authority"], createdTurn: 3 }
  ]
};

test("short-form conditions cover every documented form", () => {
  assert.equal(evaluate("flag.reason-asked", world), true);
  assert.equal(evaluate("not flag.gate-open", world), true);
  assert.equal(evaluate("state.suspicion < 78", world), false);
  assert.equal(evaluate("counter.refusals >= 6", world), true);
  assert.equal(evaluate("item.contractor-id = shown", world), true);
  assert.equal(evaluate("state.trust >= profile.trustThreshold", world), false);
  assert.equal(evaluate("item.contractor-id in [held, shown]", world), true);
  assert.equal(evaluate("some memory.tag in [threat]", world), true);
  assert.equal(evaluate("no memory.tag in [threat, weapon] since repair", world), true);
  assert.equal(evaluate("some memory.tag in [authority, proof] since repair", world), true);
});

test("lists mean all, and long form nests any and not", () => {
  assert.equal(evaluate(["flag.reason-asked", "state.trust > 10"], world), true);
  assert.equal(evaluate(["flag.reason-asked", "flag.gate-open"], world), false);
  assert.equal(evaluate({ any: ["flag.gate-open", "counter.refusals = 6"] }, world), true);
  assert.equal(evaluate({ all: ["state.trust > 10"], not: ["flag.gate-open"] }, world), true);
  assert.equal(evaluate(undefined, world), true);
  assert.equal(evaluate([], world), true);
});

test("a condition typo is an error, never a silent false", () => {
  assert.throws(() => parseCondition("state.trust >> 5"), /Unknown condition/);
  assert.throws(() => evaluate({ either: [] }, world), /Unknown condition group/);
});

test("interpolation shows values and picks text by condition", () => {
  assert.equal(interpolate("Trust {state.trust}", world), "Trust 40");
  assert.equal(interpolate("{flag.gate-open ? Open : Secured}", world), "Secured");
  assert.equal(interpolate("{profile.label}", world), "Terse Eastern European");
  assert.equal(interpolate("{var.missing}!", world), "!");
});

test("short-form effects change the world and return events", () => {
  const { world: next, events } = applyEffects(
    [
      "state trust +70",
      "state suspicion -14",
      "counter refusals = 0",
      "flag gate-open",
      "flag reason-asked off",
      "item contractor-id used",
      "screen [[guard-tower-04]]",
      'narrate "The barrier lifts."',
      { memory: { fact: "Opened the gate", tags: ["entry"] } }
    ],
    world
  );
  assert.equal(next.state.trust, 100, "state is clamped to 0–100");
  assert.equal(next.state.suspicion, 66);
  assert.equal(next.counter.refusals, 0);
  assert.equal(next.flag["gate-open"], true);
  assert.equal(next.flag["reason-asked"], false);
  assert.equal(next.item["contractor-id"], "used");
  assert.equal(next.screen, "guard-tower-04");
  assert.equal(next.memories.at(-1).fact, "Opened the gate");
  assert.deepEqual(events.map((event) => event.kind), ["screen", "narrate"]);
  assert.equal(events[1].value, "The barrier lifts.");
  assert.equal(world.state.trust, 40, "the original world is not changed");
});

test("an unknown effect is an error", () => {
  assert.throws(() => parseEffect("teleport home"), /Unknown effect/);
});

test("UI resolves theme tokens, styles, bindings, and visibility", () => {
  const theme = {
    colors: { cyan: "#62f7ff", panel: "#080e1d" },
    styles: { label: { size: 18, color: "$cyan" } }
  };
  const ui = {
    width: 320,
    height: 200,
    elements: [
      { type: "rect", id: "box", at: [10, 10, 100, 50], fill: "$panel", children: [
        { type: "text", id: "t", at: [4, 4, 90, 20], style: "label", text: "Trust {state.trust}" }
      ] },
      { type: "image", id: "open", src: "/gate-open.webp", visible: ["flag.gate-open"] },
      { type: "bar", id: "meter", at: [0, 190, 320, 10], value: "state.suspicion" },
      { type: "button", id: "id", at: [0, 0, 50, 20], label: "ID", disabled: ["item.contractor-id = shown"], do: ["flag x"] },
      { type: "rect", id: "typo", at: [0, 0, 1, 1], colour: "red" }
    ]
  };
  const resolved = resolveUi(ui, { theme, world });
  const [box, meter, button] = resolved.children;
  assert.equal(box.props.fill, "#080e1d");
  assert.equal(box.children[0].props.color, "#62f7ff");
  assert.equal(box.children[0].props.text, "Trust 40");
  assert.equal(resolved.children.some((node) => node.id === "open"), false, "hidden image is left out");
  assert.equal(meter.props.ratio, 0.8);
  assert.equal(button.props.disabled, true);
  assert.deepEqual(resolved.warnings, ['typo: "colour" does nothing on a rect']);
  assert.throws(() => resolveUi({ elements: [{ type: "star" }] }), /unknown element type "star"/);
});

test("the sample vault compiles and its UI notes draw without warnings", async () => {
  const vault = await compileVault();
  assert.deepEqual(vault.errors, []);
  for (const id of ["gate-hud", "intercom-hud"]) {
    const note = vault.notes[id];
    const themeNote = vault.notes[note.props.theme];
    const theme = { colors: themeNote.blocks.Colors, fonts: themeNote.blocks.Fonts, styles: themeNote.blocks.Styles };
    const resolved = resolveUi({ ...note.props, elements: note.blocks.Elements }, { theme, world });
    assert.deepEqual(resolved.warnings, [], id);
    assert.ok(resolved.children.length > 3, id);
  }
  assert.match(vault.world["south-gate"].elements[0].src, /^\/game\/assets\/scenes\/gate-closed\.webp$/);
});

test("objects open and close in place, and a screen change closes them", () => {
  let { world: next, events } = applyEffects(["open intercom"], world);
  assert.equal(next.open.intercom, true);
  assert.equal(evaluate("open.intercom", next), true);
  assert.deepEqual(events.map((event) => event.kind), ["open"]);
  ({ world: next } = applyEffects(["close intercom"], next));
  assert.equal(evaluate("open.intercom", next), false);
  ({ world: next } = applyEffects(["open intercom", "screen [[guard-tower-04]]"], world));
  assert.deepEqual(next.open, {});
});

test("a ui element draws another UI note inside its box, scaled", () => {
  const uis = { device: { width: 200, height: 100, elements: [{ type: "text", at: [0, 0, 200, 20], text: "{state.trust}" }] } };
  const resolved = resolveUi(
    { width: 640, height: 360, elements: [{ type: "ui", id: "dev", ui: "device", at: [100, 50, 400, 200] }] },
    { world, uis }
  );
  const [embedded] = resolved.children;
  assert.equal(embedded.props.innerWidth, 200);
  assert.equal(embedded.children[0].props.text, "40");
  assert.throws(() => resolveUi({ elements: [{ type: "ui", ui: "missing" }] }, { uis }), /UI note "missing" not found/);
});

test("the intercom is an in-world object with a UI on the gate screen", async () => {
  const vault = await compileVault();
  const intercom = vault.notes.intercom;
  assert.equal(intercom.type, "object");
  assert.deepEqual(vault.world["south-gate"].objects.map((object) => object.id), ["intercom"], "placed on the World canvas");
  assert.deepEqual(vault.world["south-gate"].objects[0].rect, [531, 137, 64, 72]);
  assert.equal(vault.notes[intercom.props.ui].type, "ui");
  assert.equal(vault.notes["intercom-call"], undefined, "the intercom is no longer a separate screen");
});

test("a canvas group becomes a screen placed by its picture", () => {
  const canvas = {
    nodes: [
      { id: "g", type: "group", label: "yard", x: 0, y: 0, width: 1400, height: 900 },
      { id: "pic", type: "file", file: "assets/yard.webp", x: 100, y: 100, width: 1280, height: 720 },
      { id: "door", type: "file", file: "objects/door.md", x: 300, y: 200, width: 128, height: 64 },
      { id: "night", type: "text", text: "if flag.night\n![[yard-night.webp]]", x: 100, y: 100, width: 1280, height: 720 },
      { id: "go", type: "text", text: "GO IN →", x: 1100, y: 600, width: 200, height: 80 },
      { id: "g2", type: "group", label: "hall", x: 0, y: 1000, width: 1280, height: 720 },
      { id: "sign", type: "text", text: "## HALL", x: 20, y: 1020, width: 400, height: 80 },
      { id: "notes", type: "group", label: "My notes", x: 2000, y: 0, width: 500, height: 500 },
      { id: "outside", type: "text", text: "ignored", x: 2050, y: 50, width: 100, height: 100 }
    ],
    edges: [{ id: "e", fromNode: "go", toNode: "g2", label: "if flag.door-open" }]
  };
  const notes = { door: { type: "object" }, hall: { type: "screen" } };
  const asset = (name) => (name.endsWith(".webp") ? `/a/${name}` : null);
  const { screens, errors } = buildWorld(canvas, { notes, asset });

  assert.deepEqual(errors, []);
  assert.deepEqual(Object.keys(screens), ["yard", "hall"], "a group with no picture and no screen note is not a screen");
  const yard = screens.yard;
  assert.equal(yard.height, 360);
  assert.deepEqual(yard.elements[0], { type: "image", id: "yard-picture", at: [0, 0, 640, 360], src: "/a/yard.webp", fit: "cover" });
  assert.deepEqual(yard.objects[0].rect, [100, 50, 64, 32]);
  assert.deepEqual(yard.elements[1].visible, ["flag.night"]);
  assert.deepEqual(yard.exits[0].do, ["screen hall"]);
  assert.deepEqual(yard.exits[0].visible, ["flag.door-open"]);
  assert.equal(screens.hall.elements[0].text, "HALL");
});
