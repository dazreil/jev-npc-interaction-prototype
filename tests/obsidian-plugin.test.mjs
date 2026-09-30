// Loads the vault's Game Tools plugin with a stand-in for the `obsidian`
// module, to check its card menu and that it really runs the asset runner.
import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const notices = [];
const modals = [];

class FakeMenu {
  items = [];
  addSeparator() {}
  addItem(build) {
    const item = {
      setTitle(title) { this.title = title; return this; },
      setIcon() { return this; },
      setChecked(checked) { this.checked = checked; return this; },
      onClick(handler) { this.click = handler; return this; }
    };
    build(item);
    this.items.push(item);
  }
}

const fakeObsidian = {
  Plugin: class {
    constructor(app) { this.app = app; }
    addStatusBarItem() { return { setText: (text) => (this.statusText = text) }; }
    registerEvent() {}
    addRibbonIcon() {}
    addCommand() {}
  },
  Notice: class { constructor(message) { notices.push(message); } },
  Modal: class {
    constructor(app) { this.app = app; this.titleEl = { setText: (text) => (this.title = text) }; this.contentEl = { createEl: (_tag, { text }) => ((this.body = text), { style: {} }) }; }
    open() { this.onOpen(); modals.push(this); }
  }
};

// Obsidian loads plugins as CommonJS; this repo's .js files are ES modules
// to Node, so the file is wrapped the way Obsidian runs it.
function loadPlugin() {
  const nodeRequire = createRequire(import.meta.url);
  const source = readFileSync(join(ROOT, "game/.obsidian/plugins/game-tools/main.js"), "utf8");
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(
    (name) => (name === "obsidian" ? fakeObsidian : nodeRequire(name)),
    module,
    module.exports
  );
  return module.exports;
}

async function makePlugin() {
  const GameTools = loadPlugin();
  let menuHandler;
  const app = {
    vault: { adapter: { getBasePath: () => join(ROOT, "game") } },
    workspace: {
      on: (name, handler) => {
        if (name === "canvas:node-menu") menuHandler = handler;
      },
      getActiveFile: () => null
    }
  };
  const plugin = new GameTools(app);
  await plugin.onload();
  return { plugin, openMenu: (node) => { const menu = new FakeMenu(); menuHandler(menu, node); return menu; } };
}

test("recipe cards get a menu; other cards do not", async () => {
  const { plugin, openMenu } = await makePlugin();
  assert.equal(plugin.repo, ROOT);
  const saved = [];
  const node = {
    text: "## gate-dawn\nimage\nstatus: idea\nprompt: a gate",
    setText(text) { this.text = text; },
    canvas: { view: { file: { extension: "canvas", path: "Assets.canvas" } }, requestSave: () => saved.push(true) }
  };
  const menu = openMenu(node);
  assert.deepEqual(menu.items.map((item) => item.title), ['Generate "gate-dawn" now', "Preview request (free)", "Redo finish only (free)", "Status: idea", "Status: go"]);
  assert.equal(menu.items[3].checked, true);

  menu.items[4].click();
  assert.equal(node.text, "## gate-dawn\nimage\nstatus: go\nprompt: a gate");
  assert.equal(saved.length, 1);

  assert.equal(openMenu({ text: "## fmv\nstyle\nlora: x" }).items.length, 0, "style cards are not run");
  assert.equal(openMenu({ text: "a plain note" }).items.length, 0);
});

test("preview runs the real runner from the repo and shows its output", async () => {
  const { plugin, openMenu } = await makePlugin();
  // Its own canvas, so the test does not depend on the cards in Assets.canvas.
  const canvasFile = join(ROOT, "game", "_plugin-test.canvas");
  writeFileSync(canvasFile, JSON.stringify({
    nodes: [
      { id: "f", type: "file", file: "assets/scenes/gate-closed.webp", x: 0, y: 0, width: 200, height: 120 },
      { id: "t", type: "text", x: 300, y: 0, width: 300, height: 200, text: "## test-talk\nanimate\nstatus: idea\nprompt: the gate sways" }
    ],
    edges: [{ id: "e", fromNode: "f", toNode: "t" }]
  }));
  after(() => rmSync(canvasFile, { force: true }));
  const node = { text: "## test-talk\nanimate\nstatus: idea", canvas: { view: { file: { extension: "canvas", path: "_plugin-test.canvas" } } } };
  const preview = openMenu(node).items.find((item) => item.title === "Preview request (free)");
  modals.length = 0;
  preview.click();
  await new Promise((resolve) => {
    const started = Date.now();
    const poll = setInterval(() => {
      if (modals.length || Date.now() - started > 20000) {
        clearInterval(poll);
        resolve();
      }
    }, 100);
  });
  assert.equal(modals.length, 1, "the preview opens in a window");
  assert.match(modals[0].body, /\[test-talk\] would call minimax\/h3\/image-to-video/);
  assert.equal(plugin.running, 0);
});
