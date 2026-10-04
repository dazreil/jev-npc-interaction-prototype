import assert from "node:assert/strict";
import test from "node:test";
import { evaluate, interpolate, parseCondition } from "../js/engine/conditions.js";
import { applyEffects, parseEffect } from "../js/engine/effects.js";
import { buildWorld } from "../js/engine/canvas-world.js";
import { clipFrame, resolveUi } from "../js/engine/ui.js";
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
  assert.match(vault.world["south-gate"].elements[0].src, /^\/game\/screens\/south-gate\/art\/car-park-yard\/car-park-yard\.webp$/);
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
  assert.deepEqual(vault.world["south-gate"].objects[0].rect, [485, 185, 43, 69], "on the right gate post");
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
  assert.deepEqual(yard.elements[0], { type: "image", id: "yard-picture", node: "pic", at: [0, 0, 640, 360], src: "/a/yard.webp", fit: "cover" });
  assert.deepEqual(yard.frame, { x: 100, y: 100, unit: 2, picture: "pic" }, "the editor can turn screen pixels back into canvas positions");
  assert.equal(yard.exits[0].node, "go", "each part knows its canvas card");
  assert.deepEqual(yard.objects[0].rect, [100, 50, 64, 32]);
  assert.deepEqual(yard.elements[1].visible, ["flag.night"]);
  assert.deepEqual(yard.exits[0].do, ["screen hall"]);
  assert.deepEqual(yard.exits[0].visible, ["flag.door-open"]);
  assert.equal(screens.hall.elements[0].text, "HALL");
});

test("an arrow from an object to a picture gives the object that picture's box and shape", () => {
  const canvas = {
    nodes: [
      { id: "g", type: "group", label: "office", x: 0, y: 0, width: 1400, height: 900 },
      { id: "pic", type: "file", file: "office.webp", x: 0, y: 0, width: 1280, height: 720 },
      { id: "sitting", type: "file", file: "miles-cut.webp", x: 100, y: 200, width: 400, height: 300 },
      { id: "miles", type: "file", file: "miles-desk.md", x: 0, y: 0, width: 50, height: 50 }
    ],
    edges: [{ id: "e", fromNode: "miles", toNode: "sitting" }]
  };
  const { screens } = buildWorld(canvas, { notes: { "miles-desk": { type: "object" } }, asset: (name) => (name.endsWith(".webp") ? `/a/${name}` : null) });
  assert.deepEqual(screens.office.objects[0], { id: "miles-desk", rect: [50, 100, 200, 150], node: "miles", mask: "/a/miles-cut.webp", follows: "sitting" });

  canvas.nodes[2].focus = [50, 0];
  const slid = buildWorld(canvas, { notes: { "miles-desk": { type: "object" } }, asset: (name) => (name.endsWith(".webp") ? `/a/${name}` : null) }).screens.office;
  assert.deepEqual(slid.elements.find((element) => element.node === "sitting").focus, [50, 0], "focus on the card slides the picture in its box");
  assert.deepEqual(slid.objects[0].maskFocus, [50, 0], "the click shape slides with it");
});

test("an item card on a screen is picked up by a click, and its picture goes with it", () => {
  const canvas = {
    nodes: [
      { id: "g", type: "group", label: "shed", x: 0, y: 0, width: 1400, height: 900 },
      { id: "pic", type: "file", file: "shed.webp", x: 0, y: 0, width: 1280, height: 720 },
      { id: "torch-pic", type: "file", file: "torch-cut.webp", x: 200, y: 400, width: 100, height: 40 },
      { id: "torch-card", type: "file", file: "torch.md", x: 0, y: 0, width: 50, height: 50 }
    ],
    edges: [{ id: "e", fromNode: "torch-card", toNode: "torch-pic", label: "shape" }]
  };
  const { screens, errors } = buildWorld(canvas, { notes: { torch: { type: "item" } }, asset: (name) => (name.endsWith(".webp") ? `/a/${name}` : null) });
  assert.deepEqual(errors, []);
  const [torch] = screens.shed.objects;
  assert.equal(torch.item, true);
  assert.deepEqual(torch.rect, [100, 200, 50, 20], "the item takes its picture's box");
  assert.equal(torch.mask, "/a/torch-cut.webp");
  assert.deepEqual(screens.shed.elements.find((element) => element.node === "torch-pic").visible, ["not item.torch"], "the picture goes once the torch is picked up");
});

test("a swing opens on its condition; mirror flips; the two do not mix", () => {
  const resolved = resolveUi(
    {
      width: 100,
      height: 50,
      elements: [
        { type: "image", id: "leaf", src: "/leaf.webp", swing: { when: ["flag.gate-open"], hinge: "right", to: 0.2 } },
        { type: "image", id: "post", src: "/post.webp", mirror: true },
        { type: "image", src: "/bad.webp", mirror: true, swing: { when: true } }
      ]
    },
    { world: { flag: { "gate-open": true } } }
  );
  const [leaf, post] = resolved.children;
  assert.deepEqual(leaf.swing, { open: true, hinge: "right", to: 0.2, seconds: 1.5, steps: 6 });
  assert.equal(post.mirror, true);
  assert.equal(resolved.warnings.length, 2, "a swing without an id, and mirror with swing, are both flagged");
  const closed = resolveUi({ elements: [{ type: "image", id: "leaf", src: "/l", swing: { when: ["flag.gate-open"] } }] }, { world: { flag: { "gate-open": false } } });
  assert.equal(closed.children[0].swing.open, false);
});

test("a walk moves to its target and back on its condition; shade darkens", () => {
  const ui = {
    elements: [
      { type: "image", id: "guard", at: [100, 20, 10, 20], src: "/g.webp", shade: 0.5, walk: { when: ["flag.arthur-out"], to: [40, 30], seconds: 12 } },
      { type: "image", id: "dog", at: [0, 0, 10, 5], src: "/d.webp", walk: { to: [50, 0], seconds: 8, loop: true, back: false } }
    ]
  };
  const out = resolveUi(ui, { world: { flag: { "arthur-out": true } } });
  const [guard, dog] = out.children;
  assert.deepEqual(guard.walk, { on: true, dx: -60, dy: 10, seconds: 12, back: true, loop: false, fps: 8 });
  assert.equal(guard.shade, 0.5);
  assert.deepEqual(dog.walk, { on: true, dx: 50, dy: 0, seconds: 8, back: false, loop: true, fps: 8 }, "no condition: always walking");
  assert.equal(out.warnings.length, 0);
  const home = resolveUi(ui, { world: { flag: { "arthur-out": false } } });
  assert.equal(home.children[0].walk.on, false);
});

test("Arthur's patrol: a timer note drives arthur-out; the intercom goes unanswered while he is out", async () => {
  const vault = await compileVault();
  const patrol = vault.notes["arthur-patrol"];
  assert.equal(patrol.type, "timer");
  assert.equal(patrol.props.flag, "arthur-out");
  assert.ok(patrol.props.for < patrol.props.every);
  const intercom = vault.notes.intercom.props;
  assert.equal(evaluate(intercom.noAnswer, { flag: { "arthur-out": true } }), true);
  assert.equal(evaluate(intercom.noAnswer, { flag: { "arthur-out": false } }), false);
  assert.ok(vault.notes["gate-yard"], "the yard layer with the walkers is in the vault");
});

test("a clip plays across, waits, then plays back mirrored; it can loop", () => {
  const patrol = { frames: 40, fps: 8, back: true, gap: 13, wait: 1, loop: false };
  assert.equal(clipFrame(patrol, 0.5), null, "waits first");
  assert.deepEqual(clipFrame(patrol, 1), { frame: 0, flip: false });
  assert.deepEqual(clipFrame(patrol, 5.99), { frame: 39, flip: false });
  assert.equal(clipFrame(patrol, 10), null, "hidden between legs");
  assert.deepEqual(clipFrame(patrol, 19), { frame: 0, flip: true });
  assert.equal(clipFrame(patrol, 30), null, "done");
  const dog = { ...patrol, wait: 0, gap: 2, loop: true };
  assert.deepEqual(clipFrame(dog, 14), { frame: 0, flip: false }, "starts again after 5 + 2 + 5 + 2 seconds");
  const out = resolveUi({ elements: [{ type: "image", id: "a", src: "/a-01.webp", clip: { when: ["flag.arthur-out"], frames: 40 } }] }, { world: { flag: {} } });
  assert.equal(out.children[0].clip.on, false);
  assert.equal(out.warnings.length, 0);
});

test("the screen editor saves boxes and order without touching anything else", async () => {
  const { editCanvas, editUiNote } = await import("../lib/editor-save.mjs");
  const note = ["---", "type: ui", "---", "", "## Elements", "```yaml", "# back", "- { type: rect, id: a, at: [0, 0, 10, 10] }", "# front", "- type: image", "  id: b", "  at: [5, 5, 20, 20] # the picture", "```", "after"].join("\n");
  assert.equal(editUiNote(note, {}), note, "no change, no difference");
  const moved = editUiNote(note, { boxes: [{ index: 1, at: [7.4, 8, 20, 20] }] });
  assert.equal(moved, note.replace("at: [5, 5, 20, 20]", "at: [7, 8, 20, 20]"), "only the box changes; its comment stays");
  const swapped = editUiNote(note, { order: [1, 0] });
  assert.ok(swapped.indexOf("id: b") < swapped.indexOf("id: a") && swapped.includes("# front\n- type: image") && swapped.endsWith("```\nafter"), "comments travel with their element");
  const canvas = JSON.stringify({ nodes: [{ id: "p", x: 0, y: 0, width: 1, height: 1 }, { id: "a", x: 0, y: 0, width: 1, height: 1 }, { id: "b", x: 0, y: 0, width: 1, height: 1 }], edges: [] });
  const next = JSON.parse(editCanvas(canvas, { boxes: [{ node: "a", x: 10.4, y: 20, width: 30, height: 40 }], order: ["b", "a"] }));
  assert.deepEqual(next.nodes.map((node) => node.id), ["p", "b", "a"]);
  assert.deepEqual(next.nodes[2], { id: "a", x: 10, y: 20, width: 30, height: 40 });
  const grown = JSON.parse(editCanvas(canvas, {
    screens: [{ label: "hall", file: "hall.webp", width: 1024, height: 768 }],
    add: [{ node: "lamp", file: "lamp.webp", x: 10, y: 20, width: 30, height: 40 }],
    links: [{ from: "a", to: "lamp", label: "shape" }]
  }));
  assert.deepEqual(grown.nodes.find((node) => node.type === "group"), { id: "screen-hall", type: "group", label: "hall", x: 0, y: 401, width: 1360, height: 1060 }, "a new screen goes below everything");
  assert.deepEqual(grown.nodes.find((node) => node.id === "hall-picture"), { id: "hall-picture", type: "file", file: "hall.webp", x: 40, y: 461, width: 1280, height: 960 });
  assert.equal(grown.nodes.find((node) => node.id === "lamp").file, "lamp.webp");
  assert.deepEqual(grown.edges.map((edge) => [edge.fromNode, edge.toNode, edge.label]), [["a", "lamp", "shape"]]);
  const shrunk = JSON.parse(editCanvas(JSON.stringify(grown), { remove: ["lamp"] }));
  assert.ok(!shrunk.nodes.some((node) => node.id === "lamp") && shrunk.edges.length === 0, "removing a card removes its arrows");
  assert.throws(() => editCanvas(JSON.stringify(grown), { screens: [{ label: "hall", file: "x.webp", width: 4, height: 3 }] }), /already exists/);
  const exit = JSON.parse(editCanvas(JSON.stringify(grown), {
    add: [{ node: "go", text: "GO TO HALL →", x: 0, y: 0, width: 10, height: 10 }],
    exits: [{ node: "go", to: "hall", condition: "flag.lit" }],
    cards: [{ node: "lamp", if: "flag.lit", file: "lamp2.webp" }]
  }));
  assert.deepEqual(exit.edges.filter((edge) => edge.fromNode === "go").map((edge) => [edge.toNode, edge.label]), [["screen-hall", "if flag.lit"]], "an exit is a text card with an arrow to the screen's group");
  assert.equal(exit.nodes.find((node) => node.id === "go").type, "text");
  assert.deepEqual([exit.nodes.find((node) => node.id === "lamp").file, exit.nodes.find((node) => node.id === "lamp").if], ["lamp2.webp", "flag.lit"]);
  const retargeted = JSON.parse(editCanvas(JSON.stringify(exit), { exits: [{ node: "go", to: "hall" }], cards: [{ node: "lamp", if: null }] }));
  assert.equal(retargeted.edges.filter((edge) => edge.fromNode === "go").length, 1, "changing an exit replaces its arrow");
  assert.equal(retargeted.nodes.find((node) => node.id === "lamp").if, undefined, "an empty condition is removed");
  const slid = JSON.parse(editCanvas(canvas, { focus: [{ node: "b", value: [50.4, 0] }] }));
  assert.deepEqual(slid.nodes[2].focus, [50, 0], "a picture's slide is kept on its card");
});

test("the settings panel changes and removes Properties, and changes UI element settings", async () => {
  const { editProps, editUiNote } = await import("../lib/editor-save.mjs");
  const note = ["---", "type: object", "label: Desk", "visible:", "  - flag.a", "  - flag.b", "use: [open x]", "---", "body"].join("\n");
  assert.equal(editProps(note, { visible: null, use: ["item torch held"] }), ["---", "type: object", "label: Desk", "use: [item torch held]", "---", "body"].join("\n"));
  const ui = ["---", "type: ui", "---", "", "## Elements", "```yaml", "# the frame", "- { type: rect, id: a, at: [0, 0, 10, 10] }", "```"].join("\n");
  const changed = editUiNote(ui, { settings: [{ index: 0, values: { fill: "#fff", id: null } }] });
  assert.ok(changed.includes("# the frame") && changed.includes('fill: "#fff"') && !changed.includes("id: a"), changed);
});

test("a save can make a new note, but never over an existing file", async () => {
  const { applyEdits } = await import("../lib/editor-save.mjs");
  const { mkdtemp, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const vault = await mkdtemp(join(tmpdir(), "vault-"));
  try {
    const result = await applyEdits(vault, { create: { "screens/hall/hall.md": "---\ntype: screen\n---\n" } });
    assert.deepEqual(result.saved, ["screens/hall/hall.md"]);
    assert.equal(await readFile(join(vault, "screens/hall/hall.md"), "utf8"), "---\ntype: screen\n---\n");
    await assert.rejects(applyEdits(vault, { create: { "screens/hall/hall.md": "again" } }), /already exists/);
    await assert.rejects(applyEdits(vault, { create: { "../out.md": "x" } }), /Not a vault file/);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("the story editor saves and deletes scenes in story/, and nowhere else", async () => {
  const { applyEdits } = await import("../lib/editor-save.mjs");
  const { mkdtemp, readFile, rm, stat } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const vault = await mkdtemp(join(tmpdir(), "vault-"));
  try {
    const scene = { id: "hello", with: "Chloe", events: [{ id: "a", type: "line", text: "Hi." }], path: "story/hello.json" };
    await applyEdits(vault, { scenes: { "story/hello.json": scene } });
    const saved = JSON.parse(await readFile(join(vault, "story/hello.json"), "utf8"));
    assert.deepEqual(saved, { id: "hello", with: "Chloe", events: [{ id: "a", type: "line", text: "Hi." }] }, "written without the compiler's path");
    await assert.rejects(applyEdits(vault, { scenes: { "screens/x.json": scene } }), /Scenes live in story/);
    await assert.rejects(applyEdits(vault, { scenes: { "story/bad.json": { nope: true } } }), /not a scene/);
    await applyEdits(vault, { scenes: { "story/hello.json": null } });
    await assert.rejects(stat(join(vault, "story/hello.json")), "null deletes it");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("the screen editor can change one Properties value, such as an object's panel", async () => {
  const { editProps } = await import("../lib/editor-save.mjs");
  const block = ["---", "type: object", "panel:", "  - 40", "  - 20", "  - 560", "  - 320", "dim: \"#000\"", "---", "", "# Body"].join("\n");
  assert.equal(editProps(block, { panel: [50, 20, 540, 320] }), ["---", "type: object", "panel: [50, 20, 540, 320]", "dim: \"#000\"", "---", "", "# Body"].join("\n"));
  const flow = "---\ntype: object\npanel: [160, 4, 424, 300] # where it opens\n---\n";
  assert.equal(editProps(flow, { panel: [150, 4, 424, 300] }), "---\ntype: object\npanel: [150, 4, 424, 300] # where it opens\n---\n");
});

test("the editor can add a Properties value that is not there yet", async () => {
  const { editProps } = await import("../lib/editor-save.mjs");
  assert.equal(editProps("---\ntype: portraits\n---\n# P", { focus: [40, 50], zoom: 1.2 }), "---\ntype: portraits\nfocus: [40, 50]\nzoom: 1.2\n---\n# P");
});

test("saving a box written as a multi-line list keeps the note valid", async () => {
  const { editUiNote } = await import("../lib/editor-save.mjs");
  const note = ["## Elements", "```yaml", "- type: slot", "  name: portrait", "  at:", "    - 20", "    - 20", "    - 182", "    - 228", "  children:", "    - { type: text, at: [0, 0, 10, 10] }", "```"].join("\n");
  const saved = editUiNote(note, { boxes: [{ index: 0, at: [10, 20, 182, 228] }] });
  assert.equal(saved, ["## Elements", "```yaml", "- type: slot", "  name: portrait", "  at: [10, 20, 182, 228]", "  children:", "    - { type: text, at: [0, 0, 10, 10] }", "```"].join("\n"));
});
