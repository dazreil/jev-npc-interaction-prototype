// A play session: the vault's screens, objects, and UI notes, driven by the
// Arthur encounter in js/game.js. Both the desktop app (player/) and the
// workbench use it, so what you test is what ships.
//
// Screens are drawn from their `ui` note. In-world objects (type: object) on
// the current screen become hotspots; using one opens its own UI over the
// scene, in place, instead of changing screen.

import { ARTHUR_CHARACTER_IDS } from "../character.js";
import { Game } from "../game.js";
import { applyEffects, parseEffect } from "./effects.js";
import { mountUi, resolveUi } from "./ui.js";

const STATE_KEYS = ["trust", "suspicion", "irritation", "fear"];
const SLOT_CSS = `
.play-log { position: absolute; inset: 0; overflow-y: auto; padding: 6px 8px; display: flex; flex-direction: column; gap: 5px; font: 16px/1.1 VT323, monospace; scrollbar-width: thin; }
.play-log p { margin: 0; }
.play-log .who { text-transform: uppercase; letter-spacing: 1px; margin-right: 6px; }
.play-input { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: transparent; padding: 0 8px; font: 18px VT323, monospace; outline: none; }
.play-input::placeholder { opacity: .55; }
`;

export class PlaySession {
  /**
   * `sound` (optional, from js/engine/sound.js) gives Arthur a voice and the
   * game its sound effects; without it lines are timed by their length.
   */
  constructor({ vault, npcTemplate, dialogueData, providers, providerId = "mock", sound = null, onChange = () => {}, onLog = () => {} }) {
    this.sound = sound;
    this.lineRun = 0;
    this.callRun = 0;
    // Show the voice download on the intercom while it connects.
    sound?.subscribe(() => {
      if (!this.world?.call?.connecting) return;
      const before = this.world.call.status;
      this.updateCallStatus();
      if (this.world.call.status !== before) this.onChange({});
    });
    this.vault = vault;
    this.npcTemplate = npcTemplate;
    this.dialogueData = dialogueData;
    this.providers = providers;
    this.providerId = providerId;
    this.onChange = onChange;
    this.onLog = onLog;
    this.game = null;
    this.chat = [];
    this.draft = "";
    this.busy = false;
    this.status = "";
  }

  notesOfType(type) {
    return Object.entries(this.vault.notes)
      .filter(([, note]) => note.type === type)
      .map(([id, note]) => ({ id, ...note }));
  }

  /**
   * Adds an Arthur line and starts his talking frames for its length, in
   * `mood` (a portrait cue such as "hostile"). After the line he settles
   * back to his neutral idle frame and blinks.
   */
  say(text, mood = "neutral", performance = null, { now = true } = {}) {
    const line = performance ?? { line: text, tone: "neutral", action: "LINE", speech: this.game?.characterProfile?.speech };
    // The greeting waits until the player calls and the line connects; it
    // appears in the log when he says it.
    if (!now) {
      this.pendingLine = { text, mood, line };
      return;
    }
    this.chat.push({ speaker: "arthur", text });
    this.mood = mood;
    this.voiceLine(line);
  }

  /**
   * Calling someone on an in-world object (one with a `conversation`):
   * the device shows CONNECTING (and the voice download, first run only)
   * until the neural voice is ready and a short ring has passed. Then the
   * line goes live and the greeting, if any, is spoken. UI notes read
   * `call.connecting` and `call.status`.
   */
  connect(firstCall) {
    const run = ++this.callRun;
    this.world.call = { connecting: true, status: "Ringing Tower 04…" };
    this.updateCallStatus();
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const ring = wait(firstCall ? 1800 : 1000);
    // The voice watchdog handles stalls; this cap only stops an endless wait.
    const voice = this.sound ? Promise.race([this.sound.whenReady, wait(180000)]) : Promise.resolve();
    Promise.all([ring, voice]).then(() => {
      if (run !== this.callRun) return;
      this.world.call = { connecting: false, live: true, status: "" };
      this.sound?.sfx.playRelay();
      if (this.pendingLine) {
        const { text, mood, line } = this.pendingLine;
        this.pendingLine = null;
        this.say(text, mood, line);
      }
      this.onChange({ focusInput: true });
    });
  }

  /** "Ringing…", or the voice download while it is still coming in. */
  updateCallStatus() {
    if (!this.world?.call?.connecting) return;
    const { loaded, total } = this.sound?.progress ?? {};
    const downloading = this.sound && !this.sound.ready && total > 0;
    this.world.call.status = downloading ? `Tuning voice ${Math.min(99, Math.round((loaded / total) * 100))}%` : "Ringing Tower 04…";
  }

  /**
   * Speaks a line: the intercom sound cue and key-up click, then his voice.
   * His talking frames run exactly while the audio plays. With no sound, the
   * frames run for a time based on the line's length.
   */
  voiceLine(line) {
    const talking = this.portrait()?.talking;
    const estimate = Math.max(talking?.minMs ?? 1200, String(line.line).length * (talking?.msPerCharacter ?? 55));
    const run = ++this.lineRun;
    if (!this.sound) {
      if (!talking) return;
      this.talkingUntil = Date.now() + estimate;
      this.startTalking();
      return;
    }
    this.talkingUntil = 0;
    this.sound.sfx.playPerformanceCue(line);
    this.sound.sfx.playIntercomKeyUp();
    this.sound.voice
      .deliver(
        { ...line, timing: { ...(line.timing ?? {}), speakingMs: estimate } },
        {
          onStart: ({ mode, engine } = {}) => {
            const voice = mode === "speech" ? engine : "silent (timed)";
            if (voice !== this.voiceEngine) this.onLog(`Voice: ${voice}`);
            this.voiceEngine = voice;
            if (run !== this.lineRun) return;
            this.talkingUntil = Infinity;
            this.startTalking();
          },
          onEnd: () => {
            if (run === this.lineRun) this.talkingUntil = Date.now();
          }
        }
      )
      .catch(() => {
        if (run === this.lineRun) this.talkingUntil = Date.now();
      });
  }

  /** Stops his voice and talking frames (hanging up, restarting). */
  hush() {
    this.lineRun += 1;
    this.talkingUntil = Date.now();
    this.sound?.voice.cancel();
  }

  /** The conversation character's portraits note: idle, talk, mood and blink frames. */
  portrait() {
    const character = this.notesOfType("character")[0];
    const note = this.vault.notes[character?.props.portraits];
    if (!note) return null;
    return {
      idle: note.blocks.Idle?.frame ?? note.blocks.Cues?.neutral,
      talking: note.blocks.Talking ?? null,
      talkingByMood: note.blocks["Talking by mood"] ?? {},
      cues: note.blocks.Cues ?? {},
      blink: note.blocks.Blink ?? null
    };
  }

  /** The frame he holds between lines: always his neutral idle frame. */
  restingFrame() {
    return this.portrait()?.idle;
  }

  talking() {
    return Date.now() < (this.talkingUntil ?? 0);
  }

  /**
   * Plays the talk frames on the portrait slot until `talkingUntil`, then
   * settles back to neutral. It finds the slot's image on each tick, so it keeps
   * working when the screen is redrawn.
   */
  startTalking() {
    if (this.talkTimer || typeof document === "undefined") return;
    const { talking, talkingByMood = {} } = this.portrait() ?? {};
    // He speaks in the mood of the line: its own loop if there is one.
    const frames = talkingByMood[this.mood] ?? talking?.frames ?? [];
    if (!frames.length) return;
    let index = 0;
    this.talkTimer = setInterval(() => {
      const image = document.querySelector(".play-portrait");
      if (!this.talking()) {
        clearInterval(this.talkTimer);
        this.talkTimer = null;
        if (image) image.src = this.restingFrame();
        return;
      }
      index = (index + 1) % frames.length;
      if (image) image.src = frames[index];
    }, talking.frameMs ?? 125);
  }

  /** Blinks now and then whenever he is not talking (he rests on neutral). */
  startBlinking() {
    if (this.blinkTimer || typeof document === "undefined") return;
    const blink = this.portrait()?.blink;
    if (!blink?.frames?.length) return;
    const gap = () => (blink.minGapMs ?? 2500) + Math.random() * ((blink.maxGapMs ?? 6000) - (blink.minGapMs ?? 2500));
    const schedule = () => {
      this.blinkTimer = setTimeout(async () => {
        if (!this.talking()) {
          for (const frame of blink.frames) {
            const image = document.querySelector(".play-portrait");
            if (!image || this.talking()) break;
            image.src = frame;
            await new Promise((resolve) => setTimeout(resolve, blink.frameMs ?? 70));
          }
          const image = document.querySelector(".play-portrait");
          if (image && !this.talking()) image.src = this.restingFrame();
        }
        schedule();
      }, gap());
    };
    schedule();
  }

  /** Swaps in a rebuilt vault (after a note is saved) without restarting. */
  setVault(vault) {
    this.vault = vault;
  }

  profileWorld(profileId) {
    const profile = this.vault.notes[profileId]?.props ?? {};
    return { id: profileId, label: profile.label ?? profileId, trustThreshold: profile.trustThreshold ?? 55 };
  }

  freshWorld(profileId) {
    const game = this.notesOfType("game")[0];
    const variables = game?.blocks.Variables ?? {};
    const character = this.notesOfType("character")[0]?.props ?? {};
    const profile = this.vault.notes[profileId]?.props ?? {};
    return {
      turn: 0,
      screen: game?.props.startScreen ?? null,
      open: {},
      state: Object.fromEntries(STATE_KEYS.map((key) => [key, Number(profile[key] ?? character[key]) || 0])),
      flag: Object.fromEntries((variables.flags ?? []).map((flag) => [flag, false])),
      counter: { ...(variables.counters ?? {}) },
      item: Object.fromEntries(
        this.notesOfType("item").filter((item) => item.props.startWith).map((item) => [item.id, "held"])
      ),
      profile: this.profileWorld(profileId),
      memories: []
    };
  }

  /**
   * Starts a new encounter. `profileId` forces Arthur's profile (pal, sir,
   * mate, friend); leave it empty for a random one. `play: false` gives a
   * world with no game, for previewing UI notes.
   */
  start({ profileId = null, play = true } = {}) {
    this.chat = [];
    this.draft = "";
    this.busy = false;
    if (!play) {
      this.game = null;
      this.world = this.freshWorld(profileId ?? this.notesOfType("profile")[0]?.id);
      return;
    }
    // The game's first random call picks Arthur's profile.
    let forced = profileId ? ARTHUR_CHARACTER_IDS.indexOf(profileId) : -1;
    const random = () => {
      if (forced < 0) return Math.random();
      const value = (forced + 0.5) / ARTHUR_CHARACTER_IDS.length;
      forced = -1;
      return value;
    };
    this.game = new Game({
      npcTemplate: this.npcTemplate,
      dialogueData: this.dialogueData,
      provider: this.providers[this.providerId],
      providerId: this.providerId,
      random
    });
    this.world = this.freshWorld(this.game.characterProfile.id);
    this.chat = [];
    this.hush();
    this.called = false;
    this.callRun += 1;
    this.pendingLine = null;
    this.say(this.game.getOpeningDialogue(), "neutral", {
      line: this.game.getOpeningDialogue(),
      tone: "neutral",
      action: "OPENING",
      speech: this.game.characterProfile.speech
    }, { now: false });
    this.sync();
  }

  setProvider(providerId) {
    this.providerId = providerId;
    this.game?.setProvider(this.providers[providerId], providerId);
  }

  /** Copies the encounter's state into the world the UI reads. */
  sync() {
    const game = this.game;
    if (!game) return;
    this.world.state = { ...game.npc.state };
    this.world.profile = this.profileWorld(game.characterProfile.id);
    this.world.item["contractor-id"] = game.fakeIdShown ? "shown" : "held";
    this.world.flag["company-call-pending"] = game.companyCallPending;
    this.world.flag["reason-asked"] = game.reasonPrompted;
    this.world.flag["gate-open"] = game.outcome === "entry_granted";
    this.world.counter.refusals = game.refusals;
    this.world.counter["support-requests"] = game.supportRequests;
    this.world.outcome = game.status === "active" ? null : game.outcome;
  }

  endingText(outcome) {
    const note = this.vault.notes[String(outcome).replaceAll("_", "-")];
    return note ? `${note.props.title}. ${note.props.code ?? ""}`.trim() : `Encounter over: ${outcome}`;
  }

  async send() {
    const text = this.draft.trim();
    const game = this.game;
    if (!game || this.busy || !text || game.status !== "active") return;
    this.busy = true;
    this.chat.push({ speaker: "player", text });
    this.draft = "";
    this.onChange({ focusInput: true });
    try {
      const result = await game.takeTurn(text);
      this.say(result.dialogue, result.npcPerformance?.portraitCue ?? "neutral", result.npcPerformance ?? null);
      if (result.decision) this.onLog(`Arthur chose ${result.decision.action}`);
      this.sync();
      if (game.status !== "active") {
        this.chat.push({ speaker: "system", text: this.endingText(game.outcome) });
        this.onLog(`Ending: ${game.outcome}`);
      }
      this.status = "";
    } catch (error) {
      this.chat.pop();
      this.draft = text;
      if (error.name === "DecisionProviderError" && this.providerId !== "mock") {
        this.setProvider("mock");
        this.status = `${error.message}. Switched to Mock. Press Enter to try again.`;
      } else {
        this.status = error.message;
      }
      this.onLog(this.status);
    }
    this.busy = false;
    this.onChange({ focusInput: true });
  }

  showId() {
    const game = this.game;
    if (!game || game.status !== "active") return;
    const result = game.presentFakeId();
    if (!result) return;
    this.chat.push({ speaker: "player", text: result.playerInput });
    this.say(result.dialogue, "suspicious", { line: result.dialogue, tone: "neutral", action: "ASK_FOR_PROOF", speech: game.characterProfile.speech });
    this.sync();
  }

  /** Runs a button's effects. Game commands go to the encounter. */
  runEffects(effects, label = "button") {
    this.onLog(`Used ${label}`);
    if (this.sound) {
      this.sound.unlock();
      this.sound.sfx.playInterfaceClick();
    }
    const rest = [];
    for (const effect of [].concat(effects ?? [])) {
      const parsed = parseEffect(effect);
      if (this.game && parsed.kind === "send") this.send();
      else if (this.game && parsed.kind === "item" && parsed.key === "contractor-id" && parsed.value === "shown") this.showId();
      else rest.push(effect);
    }
    const { world, events } = applyEffects(rest, this.world);
    this.world = world;
    this.sync();
    for (const event of events) {
      if (event.kind === "open") {
        this.sound?.sfx.startAmbience();
        if (this.vault.notes[event.key]?.props.conversation) {
          this.connect(!this.called);
          this.called = true;
        }
      }
      if (event.kind === "close") {
        this.callRun += 1;
        this.world.call = { connecting: false, live: false, status: "" };
        this.hush();
      }
      if (event.kind === "open" || event.kind === "close") this.onLog(`${event.kind} ${event.key}`);
      else if (event.kind === "screen") this.onLog(`Screen → ${event.value}`);
      else this.onLog(`${event.kind}: ${event.value ?? ""}`);
    }
    this.onChange({ focusInput: events.some((event) => event.kind === "open") });
  }

  theme(themeId) {
    const note = this.vault.notes[themeId];
    return {
      colors: note?.blocks.Colors ?? {},
      fonts: note?.blocks.Fonts ?? {},
      styles: note?.blocks.Styles ?? {}
    };
  }

  uiDefinitions() {
    return Object.fromEntries(
      this.notesOfType("ui").map((note) => [note.id, { ...note.props, elements: note.blocks.Elements ?? [] }])
    );
  }

  /** Adds in-world objects: a hotspot when closed, their UI in place when open. */
  addObjects(elements, placements, width, height) {
    for (const { id, rect, panel } of placements) {
      const props = this.vault.notes[id]?.props ?? {};
      if (this.world.open?.[id]) {
        if (props.dim !== false) elements.push({ type: "rect", at: [0, 0, width, height], fill: props.dim ?? "#000000aa" });
        elements.push({ type: "ui", id, ui: props.ui, at: panel ?? props.panel ?? [0, 0, width, height] });
      } else if (rect) {
        elements.push({
          type: "button",
          id: `${id}-hotspot`,
          at: rect,
          style: "hotspot",
          label: props.label ?? props.name ?? id,
          key: props.key,
          visible: props.visible,
          do: props.use ?? [`open ${id}`]
        });
      }
    }
  }

  /**
   * The current screen. From the world canvas when Game.md names one;
   * otherwise from the screen note's `ui` and object notes' `rect`.
   */
  composeScreen() {
    const screenId = this.world.screen;
    const screen = this.vault.notes[screenId];
    const game = this.notesOfType("game")[0];
    const built = this.vault.world?.[screenId];
    const baseUi = this.vault.notes[screen?.props.ui];
    let elements;
    let width;
    let height;

    if (built) {
      ({ width, height } = built);
      elements = [...built.elements];
      if (baseUi) {
        // Same size as the screen: lay its elements in directly, so their
        // `layer: top` still lifts them above opened objects. Otherwise
        // embed it, scaled to the screen.
        const sameSize = Number(baseUi.props.width) === width && Number(baseUi.props.height) === height;
        if (sameSize) elements.push(...(baseUi.blocks.Elements ?? []));
        else elements.push({ type: "ui", id: screen.props.ui, ui: screen.props.ui, at: [0, 0, width, height] });
      }
      this.addObjects(elements, built.objects, width, height);
      elements.push(...built.exits);
    } else {
      if (!baseUi) throw new Error(`Screen "${screenId}" is not on the world canvas and has no ui note.`);
      width = Number(baseUi.props.width) || 640;
      height = Number(baseUi.props.height) || 360;
      elements = [...(baseUi.blocks.Elements ?? [])];
      const placed = this.notesOfType("object")
        .filter((note) => note.props.screen === screenId)
        .map((note) => ({ id: note.id, rect: note.props.rect, panel: note.props.panel }));
      this.addObjects(elements, placed, width, height);
    }

    // `layer: top` elements (such as the player's own items) stay above
    // opened objects and their dimming.
    const top = elements.filter((element) => element.layer === "top");
    const rest = elements.filter((element) => element.layer !== "top");
    return {
      note: screen ?? game,
      themeId: baseUi?.props.theme ?? game?.props.theme,
      definition: { width, height, background: "$screen", elements: [...rest, ...top] }
    };
  }

  /**
   * Draws into `stage`. With `uiId`, draws that one UI note (preview);
   * otherwise draws the current screen. Returns the problems found.
   */
  render(stage, { uiId = null, previewSlots = false, focusInput = false, maxWidth = Infinity, maxHeight = Infinity, maxScale = 2 } = {}) {
    const hadFocus = document.activeElement?.classList.contains("play-input");
    const problems = [...(this.vault.errors ?? [])];
    let note;
    let definition;
    let themeId;
    try {
      if (uiId) {
        note = this.vault.notes[uiId];
        definition = { ...note.props, elements: note.blocks.Elements ?? [] };
        themeId = note.props.theme;
      } else {
        ({ note, definition, themeId } = this.composeScreen());
      }
      const theme = this.theme(themeId);
      const resolved = resolveUi(definition, { theme, world: this.world, uis: this.uiDefinitions() });
      problems.push(...resolved.warnings.map((warning) => `${note.path}: ${warning}`));
      const { root, slots } = mountUi(stage, resolved, {
        previewSlots: previewSlots && !this.game,
        onAction: (effects, node) => this.runEffects(effects, node.id ?? node.props.label)
      });
      if (this.game) this.fillSlots(slots, theme);
      const scale = Math.max(0.25, Math.min(maxWidth / resolved.width, maxHeight / resolved.height, maxScale));
      root.style.transform = `scale(${scale})`;
      stage.style.width = `${resolved.width * scale}px`;
      stage.style.height = `${resolved.height * scale}px`;
      if (hadFocus || focusInput) {
        const input = stage.querySelector(".play-input");
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      }
    } catch (error) {
      stage.textContent = error.message;
      problems.push(`${note?.path ?? "screen"}: ${error.message}`);
    }
    return { note, problems };
  }

  fillSlots(slots, theme) {
    if (!document.getElementById("play-slot-css")) {
      const css = document.createElement("style");
      css.id = "play-slot-css";
      css.textContent = SLOT_CSS;
      document.head.append(css);
    }
    const colors = theme.colors ?? {};
    const logSlot = slots.get("conversation-log");
    if (logSlot) {
      logSlot.textContent = "";
      const list = document.createElement("div");
      list.className = "play-log";
      list.setAttribute("role", "log");
      list.setAttribute("aria-live", "polite");
      const lines = this.busy ? [...this.chat, { speaker: "system", text: "Arthur is thinking…" }] : this.chat;
      for (const line of lines) {
        const row = document.createElement("p");
        const who = document.createElement("span");
        who.className = "who";
        who.textContent = { arthur: "Arthur", player: "You", system: "▪" }[line.speaker];
        who.style.color = { arthur: colors.cyan, player: colors.magenta }[line.speaker] ?? colors.muted;
        row.className = line.speaker;
        row.style.color = line.speaker === "system" ? colors.muted : colors.text;
        row.append(who, line.text);
        list.append(row);
      }
      logSlot.append(list);
      list.scrollTop = list.scrollHeight;
    }

    const portraitSlot = slots.get("portrait");
    const portrait = this.portrait();
    if (portraitSlot && portrait?.idle) {
      portraitSlot.textContent = "";
      const image = document.createElement("img");
      image.className = "play-portrait";
      image.alt = "";
      image.decoding = "sync";
      // A redraw mid-line keeps the talking timer in charge of the frame.
      image.src = this.talking() ? (portrait.talkingByMood[this.mood] ?? portrait.talking?.frames ?? [])[0] ?? portrait.idle : this.restingFrame();
      Object.assign(image.style, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", imageRendering: "pixelated" });
      portraitSlot.append(image);
      // Load every frame now, so the first line, mood or blink does not stutter.
      const frames = [
        ...(portrait.talking?.frames ?? []),
        ...Object.values(portrait.talkingByMood).flat(),
        ...Object.values(portrait.cues),
        ...(portrait.blink?.frames ?? [])
      ];
      if (!this.preloaded) for (const frame of new Set(frames)) new Image().src = frame;
      this.preloaded = true;
      this.startBlinking();
    }

    const inputSlot = slots.get("text-input");
    if (inputSlot) {
      inputSlot.textContent = "";
      const input = document.createElement("input");
      input.className = "play-input";
      input.setAttribute("aria-label", "Say something to Arthur");
      input.autocomplete = "off";
      input.value = this.draft;
      input.style.color = colors.text;
      const active = this.game?.status === "active";
      const connecting = Boolean(this.world.call?.connecting);
      input.disabled = this.busy || !active || connecting;
      input.placeholder = connecting ? "Connecting…" : active ? "Talk to Arthur…" : "Encounter over.";
      input.addEventListener("input", () => {
        this.draft = input.value;
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.send();
        }
      });
      inputSlot.append(input);
    }
  }
}

/** Clicks the stage button whose `key` matches, unless the player is typing. */
export function bindUiKeys(stage) {
  document.addEventListener("keydown", (event) => {
    const typing = event.target.closest?.("input, select, textarea");
    if (typing && event.key !== "Escape") return;
    const button = [...stage.querySelectorAll("[data-key]")].find(
      (candidate) => candidate.dataset.key.toLowerCase() === event.key.toLowerCase()
    );
    if (button && !button.disabled) {
      event.preventDefault();
      button.click();
    }
  });
}
