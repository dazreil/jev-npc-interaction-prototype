// Game Tools: run the asset canvas and the game from inside Obsidian.
// Plain JavaScript on purpose, so there is no build step. It runs the same
// scripts as the terminal (scripts/assets.mjs, npm run app), from the repo
// folder that holds this vault.
//
// Right-click a recipe card on a canvas: set its status, generate it now,
// or preview the request for free. Commands (Cmd+P, "Game Tools"): generate
// every card set to go, watch the canvas, play the game, open the workbench,
// and make a new character, scene, or item from its template.

const { Modal, Notice, Plugin } = require("obsidian");
const { spawn } = require("child_process");
const path = require("path");

const RECIPE = /^##\s+([\w.-]+)\s*\n(style|image|edit|cutout|animate|composite)\s*(?:\n|$)/i;
const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

function readRecipe(text) {
  const match = String(text ?? "").match(RECIPE);
  if (!match) return null;
  const status = String(text).match(/^status\s*:\s*(.*)$/im)?.[1]?.trim().toLowerCase() ?? "";
  return { name: match[1], kind: match[2].toLowerCase(), status };
}

function setStatusLine(text, status) {
  const lines = String(text).split("\n");
  const index = lines.findIndex((line, i) => i >= 2 && /^status\s*:/i.test(line));
  if (index >= 0) lines[index] = `status: ${status}`;
  else lines.splice(2, 0, `status: ${status}`);
  return lines.join("\n");
}

class OutputModal extends Modal {
  constructor(app, title, text) {
    super(app);
    this.title = title;
    this.text = text;
  }
  onOpen() {
    this.titleEl.setText(this.title);
    const pre = this.contentEl.createEl("pre", { text: this.text });
    pre.style.whiteSpace = "pre-wrap";
    pre.style.userSelect = "text";
    pre.style.maxHeight = "60vh";
    pre.style.overflow = "auto";
  }
}

/** Asks for a name and a one-line description, then makes the thing. */
class NewThingModal extends Modal {
  constructor(app, kind, onMake) {
    super(app);
    this.kind = kind;
    this.onMake = onMake;
  }
  onOpen() {
    const hint = {
      character: "Who they are and how they look, e.g. a tired night nurse in her 50s, short grey hair, blue scrubs",
      scene: "What the camera sees, e.g. a dim loading bay at night, roller doors, pallets, one strip light",
      item: "What it looks like, e.g. a heavy black police torch"
    }[this.kind];
    this.titleEl.setText(`New ${this.kind}`);
    const name = this.contentEl.createEl("input", { type: "text", placeholder: "Name" });
    const description = this.contentEl.createEl("textarea", { placeholder: hint });
    for (const field of [name, description]) Object.assign(field.style, { display: "block", width: "100%", marginBottom: "8px" });
    description.rows = 3;
    const button = this.contentEl.createEl("button", { text: `Make ${this.kind}` });
    const make = () => {
      if (!name.value.trim()) return name.focus();
      this.close();
      this.onMake(name.value.trim(), description.value.trim());
    };
    button.addEventListener("click", make);
    name.addEventListener("keydown", (event) => event.key === "Enter" && make());
    name.focus();
  }
}

module.exports = class GameTools extends Plugin {
  async onload() {
    // The vault is a folder in the repo (game/, silver-edit/, ...); the
    // scripts live one level up and are told which vault to use.
    this.repo = path.dirname(this.app.vault.adapter.getBasePath());
    this.vaultName = path.basename(this.app.vault.adapter.getBasePath());
    this.watcher = null;
    this.workbench = null;
    this.running = 0;
    this.statusEl = this.addStatusBarItem();

    this.registerEvent(this.app.workspace.on("canvas:node-menu", (menu, node) => this.addCardMenu(menu, node)));

    this.addRibbonIcon("wand-2", "Generate asset cards set to go", () => this.runAssets([], this.canvasPath()));
    this.addCommand({ id: "generate-go", name: "Generate every card set to go", callback: () => this.runAssets([], this.canvasPath()) });
    this.addCommand({ id: "preview-go", name: "Preview requests (free, sends nothing)", callback: () => this.runAssets(["--dry-run"], this.canvasPath()) });
    this.addCommand({ id: "watch", name: "Start or stop watching the asset canvas", callback: () => this.toggleWatch() });
    this.addCommand({ id: "play", name: "Play the game", callback: () => this.play() });
    this.addCommand({ id: "workbench", name: "Open the workbench", callback: () => this.openWorkbench() });
    for (const kind of ["character", "scene", "item"]) {
      this.addCommand({ id: `new-${kind}`, name: `New ${kind}…`, callback: () => new NewThingModal(this.app, kind, (name, description) => this.newThing(kind, name, description)).open() });
    }
    this.showStatus();
  }

  onunload() {
    this.watcher?.kill();
    this.workbench?.kill();
  }

  /** The open canvas, or Assets.canvas. Paths are relative to the vault. */
  canvasPath(node) {
    const file = node?.canvas?.view?.file ?? this.app.workspace.getActiveFile();
    return file?.extension === "canvas" ? file.path : "Assets.canvas";
  }

  addCardMenu(menu, node) {
    const text = typeof node?.text === "string" ? node.text : node?.getData?.().text;
    const recipe = readRecipe(text);
    if (!recipe || recipe.kind === "style") return;
    const canvas = this.canvasPath(node);

    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle(`Generate "${recipe.name}" now`).setIcon("wand-2").onClick(() => this.runAssets(["--card", recipe.name], canvas, node))
    );
    menu.addItem((item) =>
      item.setTitle("Preview request (free)").setIcon("eye").onClick(() => this.runAssets(["--dry-run", "--card", recipe.name], canvas))
    );
    menu.addItem((item) =>
      item
        .setTitle("Redo finish only (free)")
        .setIcon("refresh-cw")
        .onClick(() => this.runAssets(["--card", recipe.name, "--refinish"], canvas, node))
    );
    for (const status of ["idea", "go"]) {
      menu.addItem((item) =>
        item
          .setTitle(`Status: ${status}`)
          .setIcon(status === "go" ? "play" : "lightbulb")
          .setChecked(recipe.status === status)
          .onClick(() => this.setCardStatus(node, status))
      );
    }
  }

  setCardStatus(node, status) {
    try {
      const text = typeof node.text === "string" ? node.text : node.getData().text;
      node.setText(setStatusLine(text, status));
      node.canvas?.requestSave?.();
    } catch (error) {
      new Notice(`Could not change the card: ${error.message}`);
    }
  }

  /** Runs a command from the repo folder through a login shell, so node is on PATH. */
  spawnInRepo(command, { detached = false } = {}) {
    const shell = process.env.SHELL || "/bin/zsh";
    return spawn(shell, ["-lc", command], {
      cwd: this.repo,
      env: { ...process.env, GAME_VAULT: this.vaultName },
      detached,
      stdio: detached ? "ignore" : ["ignore", "pipe", "pipe"]
    });
  }

  /** The open views of a canvas file. */
  canvasViews(canvas) {
    return this.app.workspace
      .getLeavesOfType?.("canvas")
      ?.map((leaf) => leaf.view)
      .filter((view) => view?.file?.path === canvas) ?? [];
  }

  /**
   * Shows what the runner wrote. An open canvas keeps its own copy, so it
   * would not show the new status colour, and it keeps showing a picture
   * that was replaced under the same name. Reloading it from disk fixes both.
   */
  async reloadCanvas(canvas) {
    for (const view of this.canvasViews(canvas)) {
      try {
        const data = await this.app.vault.adapter.read(canvas);
        view.setViewData(data, true);
      } catch (error) {
        console.warn("Game Tools: could not reload the canvas", error);
      }
    }
  }

  async runAssets(args, canvas, node = null) {
    const dryRun = args.includes("--dry-run");
    const label = args.includes("--card") ? args[args.indexOf("--card") + 1] : "cards set to go";
    if (!dryRun) {
      // Turn the card yellow at once, and save the canvas, so the runner reads
      // what you just typed.
      try {
        node?.setColor?.("3");
        for (const view of this.canvasViews(canvas)) await view.save?.();
      } catch (error) {
        console.warn("Game Tools: could not save the canvas first", error);
      }
    }
    const child = this.spawnInRepo(["node", "scripts/assets.mjs", canvas, ...args].map(shellQuote).join(" "));
    let output = "";
    let lastLine = "";
    this.running += 1;
    this.showStatus();
    if (!dryRun) new Notice(`Generating ${label}…`);

    const onData = (chunk) => {
      const text = chunk.toString().replace(/\r/g, "\n");
      output += text;
      for (const line of text.split("\n").map((part) => part.trim()).filter(Boolean)) {
        lastLine = line;
        if (!dryRun && /\] (done|refinished|error)/.test(line)) new Notice(line, line.includes("error") ? 12000 : 6000);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (error) => new Notice(`Could not start the runner: ${error.message}`, 12000));
    child.on("close", (code) => {
      this.running -= 1;
      this.showStatus();
      if (dryRun) new OutputModal(this.app, `Preview: ${label}`, output.trim() || "(no output)").open();
      else if (code !== 0) new Notice(`Asset runner stopped: ${lastLine}`, 12000);
      else if (/No cards|No recipe card/.test(output)) new Notice(lastLine);
      if (!dryRun) this.reloadCanvas(canvas);
    });
  }

  /** Runs the template script, then opens the new canvas. */
  newThing(kind, name, description) {
    const child = this.spawnInRepo(["node", "scripts/new-thing.mjs", kind, name, description].map(shellQuote).join(" "));
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => {
      const message = output.trim().split("\n").pop();
      new Notice(message || (code === 0 ? `Made ${name}` : `Could not make ${name}`), code === 0 ? 6000 : 12000);
      const canvas = output.match(/Open (.+\.canvas)/)?.[1];
      if (code === 0 && canvas) setTimeout(() => this.app.workspace.openLinkText(canvas, "", true), 500);
    });
  }

  toggleWatch() {
    if (this.watcher) {
      this.watcher.kill();
      this.watcher = null;
      new Notice("Stopped watching the asset canvas.");
      this.showStatus();
      return;
    }
    const canvas = this.canvasPath();
    this.watcher = this.spawnInRepo(["node", "scripts/assets.mjs", canvas, "--watch"].map(shellQuote).join(" "));
    const onData = (chunk) => {
      for (const line of chunk.toString().split(/[\r\n]+/).map((part) => part.trim()).filter(Boolean)) {
        if (/\] (done|error)|FAL_KEY/.test(line)) new Notice(line, line.includes("error") ? 12000 : 6000);
        if (/\] (done|error|cut out)/.test(line)) this.reloadCanvas(canvas);
      }
    };
    this.watcher.stdout.on("data", onData);
    this.watcher.stderr.on("data", onData);
    this.watcher.on("close", () => {
      this.watcher = null;
      this.showStatus();
    });
    new Notice(`Watching ${canvas}. Set a card to "go" and it runs.`);
    this.showStatus();
  }

  play() {
    this.spawnInRepo("npm run app", { detached: true }).unref();
    new Notice("Starting the game…");
  }

  openWorkbench() {
    if (!this.workbench) {
      this.workbench = this.spawnInRepo("npm run workbench");
      this.workbench.on("close", () => (this.workbench = null));
    }
    setTimeout(() => window.open("http://localhost:5174"), 1500);
  }

  showStatus() {
    const parts = [];
    if (this.running) parts.push(`⚙ generating (${this.running})`);
    if (this.watcher) parts.push("👁 watching assets");
    this.statusEl.setText(parts.join("  "));
  }
};
