// The Characters workspace: make and edit characters in the game, and make
// their art. Opened from the screen editor (Cmd+E → Characters).
//
// Left: the characters, and New character. Details: name, role, how they
// talk, their moods (State) and when each tone shows (Tones), their voice.
// Art: every art card on their canvas as a tile: its result, its model and
// prompt, Make (asks before spending), Redo finish (free), and Import picture
// (a picture made by hand or elsewhere becomes the card's result).

import { parseCondition } from "/js/engine/conditions.js";

const KOKORO_VOICES = ["am_michael", "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_onyx", "am_puck", "af_heart", "af_alloy", "af_aoede", "af_bella", "af_jessica", "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky"];
const MODEL_KIND = { image: "image", edit: "edit", animate: "video" };
const FREE = new Set(["cutout", "crop", "composite"]);

const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...[].concat(children).filter((child) => child !== null && child !== undefined && child !== false));
  return node;
};
const button = (text, onClick, extra = {}) => el("button", { type: "button", textContent: text, onclick: onClick, ...extra });

export function createCharactersEditor({ session, host, reloadVault, onClose = () => {} }) {
  let open = false;
  let current = null;
  let tab = "details";
  let status = "";
  let busy = new Set(); // cards being made
  let draft = null; // the character's details being edited
  let lastSave = null;
  let keyed = new Set(["fal"]); // services with a key (asked for when the workspace opens)
  let elevenVoices = null; // the ElevenLabs account's voices, once asked for

  const root = el("div", { className: "story-editor characters-editor", hidden: true });
  document.body.append(root);

  const vault = () => session.vault;
  const characters = () => Object.entries(vault().notes).filter(([, note]) => note.type === "character").map(([id, note]) => ({ id, ...note }));
  const note = () => vault().notes[current];
  const folder = () => note()?.path.split("/").slice(0, -1).join("/");
  const canvasPath = () => Object.keys(vault().art ?? {}).find((path) => path.startsWith(`${folder()}/`) && !path.includes("/", folder().length + 1)) ?? null;
  const cards = () => vault().art?.[canvasPath()] ?? [];
  const since = () => {
    const builtAt = vault().builtAt;
    return lastSave && lastSave > builtAt ? lastSave : builtAt;
  };
  const fail = (text) => {
    status = text;
    render();
  };

  // ---------------------------------------------------------------- details

  /** A working copy of the character's details, from their note. */
  function readDraft() {
    const item = note();
    if (!item) return null;
    const style = (item.sections ?? []).find((section) => section.title === "Style")?.text?.trim() ?? "";
    return {
      name: item.props.name ?? current,
      role: item.props.role ?? "",
      style,
      // No State block yet (a character from the template): their moods are the
      // four starting ones in Properties, which their actions change.
      state: Object.entries(item.blocks.State ?? Object.fromEntries(["trust", "suspicion", "irritation", "fear"].map((key) => [key, item.props[key] ?? 0]))).map(([key, value]) => ({ key, value: Number(value) || 0 })),
      tones: [].concat(item.blocks.Tones ?? []).map((row) => ({ tone: row?.tone ?? "", when: row?.when ?? "" })),
      voice: item.props.voice ?? "",
      voiceSpeed: Number(item.props.voiceSpeed) || 1,
      voiceService: item.props.voiceService || "kokoro",
      voiceModel: item.props.voiceModel ?? "eleven_multilingual_v2",
      changed: false
    };
  }

  async function saveDetails() {
    if (!host?.saveEdits) return fail("Saving works in the desktop app (npm run app).");
    const d = draft;
    const state = Object.fromEntries(d.state.filter((row) => row.key.trim()).map((row) => [row.key.trim(), Math.max(0, Math.min(100, Number(row.value) || 0))]));
    const tones = d.tones.filter((row) => row.tone.trim()).map((row) => (row.when.trim() ? { tone: row.tone.trim(), when: row.when.trim() } : { tone: row.tone.trim() }));
    const result = await host.saveEdits({
      canvases: {},
      notes: { [note().path]: { boxes: [], props: { name: d.name.trim() || current, role: d.role.trim() || null, voice: d.voice || null, voiceSpeed: d.voice && d.voiceService === "kokoro" ? d.voiceSpeed : null, voiceService: d.voiceService === "kokoro" ? null : d.voiceService, voiceModel: d.voiceService === "elevenlabs" ? d.voiceModel : null }, sections: { Style: d.style }, blocks: { State: state, Tones: tones } } },
      since: since()
    });
    if (result.error) return fail(`Could not save: ${result.error}`);
    if (result.conflicts?.length) return fail(`${result.conflicts.join(", ")} changed on disk. Close and open the workspace again.`);
    lastSave = new Date().toISOString();
    await reloadVault?.();
    draft = readDraft();
    fail(`Saved ${current}.`);
  }

  // ---------------------------------------------------------------- art

  const modelFor = (id) => (vault().models ?? []).find((model) => model.id === id);
  function cost(card) {
    const model = modelFor(card.model);
    if (!model?.cost) return null;
    const seconds = Number(card.fields.seconds) || 5;
    return model.per === "second" ? model.cost * seconds : model.cost;
  }

  async function saveCard(card, fields) {
    const result = await host.saveEdits({ canvases: { [canvasPath()]: { boxes: [], recipes: [{ node: card.node, fields }] } }, notes: {}, since: since() });
    if (result.error) return fail(`Could not save ${card.name}: ${result.error}`);
    if (result.conflicts?.length) return fail(`${canvasPath()} changed on disk. Close and open the workspace again.`);
    lastSave = new Date().toISOString();
    await reloadVault?.();
    render();
  }

  async function make(card, { refinish = false } = {}) {
    if (!host?.studio) return fail("Making art works in the desktop app (npm run app).");
    if (!refinish && !FREE.has(card.kind)) {
      const price = cost(card);
      const ask = `Make ${card.name} with ${card.model ?? "the default model"}${price ? `, about $${price.toFixed(3)}` : ""}? This calls the selected AI service and costs money.`;
      if (!confirm(ask)) return;
    }
    busy.add(card.name);
    status = `${refinish ? "Redoing the finish of" : "Making"} ${card.name}…`;
    render();
    const result = await host.studio("run", { canvas: canvasPath(), card: card.name, refinish });
    busy.delete(card.name);
    await reloadVault?.();
    fail(result.ok ? `${card.name}: done.` : `${card.name}: ${result.error ?? result.log?.split("\n").slice(-2).join(" ") ?? "failed"}`);
  }

  /** Asks for a picture file, then sends it in as a card's result. */
  function importInto(card, create = false) {
    const picker = el("input", { type: "file", accept: "image/*" });
    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return;
      const name = create ? card : card.name;
      busy.add(name);
      status = `Importing ${file.name} into ${name}…`;
      render();
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const result = await host.studio("import", { canvas: canvasPath(), card: name, fileName: file.name, data, create });
      busy.delete(name);
      await reloadVault?.();
      fail(result.ok ? `${file.name} is now ${name}'s picture.` : `Could not import: ${result.error ?? result.log}`);
    };
    picker.click();
  }

  // ---------------------------------------------------------------- drawing

  function render() {
    if (!open) return;
    root.replaceChildren(head(), el("div", { className: "story-main characters-main" }, [left(), main()]));
  }

  function head() {
    return el("div", { className: "story-head" }, [
      el("strong", { textContent: "Characters" }),
      el("span", { className: "story-where", textContent: current ? `${note()?.props.name ?? current}` : "" }),
      el("span", { className: "story-status", textContent: status }),
      button("Close", close)
    ]);
  }

  function left() {
    const list = el("div", { className: "story-scenes" }, characters().map((item) => button(item.props.name ?? item.id, () => {
      if (draft?.changed && !confirm("Leave without saving these details?")) return;
      current = item.id;
      draft = readDraft();
      status = "";
      render();
    }, { className: item.id === current ? "on" : "" })));
    const name = el("input", { placeholder: "Name, such as Mira Hale" });
    const description = el("textarea", { rows: 3, placeholder: "Who they are and how they look: a tired night nurse in her fifties, short grey hair, blue scrubs" });
    const makeNew = button("＋ New character", async () => {
      if (!name.value.trim()) return fail("Give the new character a name.");
      if (!host?.studio) return fail("Making characters works in the desktop app (npm run app).");
      status = `Making ${name.value.trim()}…`;
      render();
      const result = await host.studio("new", { name: name.value.trim(), description: description.value.trim() });
      if (!result.ok) return fail(`Could not make it: ${result.error}`);
      await reloadVault?.();
      current = characters().find((item) => (item.props.name ?? item.id).toLowerCase() === name.value.trim().toLowerCase())?.id ?? current;
      draft = readDraft();
      tab = "details";
      fail(`Made ${name.value.trim()}: notes, four starter actions, lines, a portraits note and every art card (none made yet).`);
    });
    return el("div", { className: "story-left" }, [
      el("h3", { textContent: "Characters" }), list,
      el("h3", { textContent: "New" }),
      el("div", { className: "story-new" }, [name, description, makeNew])
    ]);
  }

  function main() {
    if (!note()) return el("div", { className: "story-timeline" }, [el("p", { className: "story-hint", textContent: "Pick a character on the left, or make a new one." })]);
    const tabs = el("div", { className: "editor-add-tabs characters-tabs" }, [
      button("Details", () => { tab = "details"; render(); }, { className: tab === "details" ? "on" : "" }),
      button("Art", () => { tab = "art"; render(); }, { className: tab === "art" ? "on" : "" })
    ]);
    return el("div", { className: "story-timeline characters-body" }, [tabs, tab === "details" ? details() : art()]);
  }

  function field(label, input, hint) {
    return el("label", { className: "story-field" }, [el("span", { textContent: label }), input, hint ? el("small", { textContent: hint }) : null]);
  }

  function details() {
    const d = (draft ??= readDraft());
    const touch = () => {
      d.changed = true;
      saveButton.disabled = false;
    };
    const text = (key, props = {}) => {
      const input = el(props.rows ? "textarea" : "input", { value: d[key], ...props });
      input.oninput = () => {
        d[key] = input.value;
        touch();
      };
      return input;
    };
    const saveButton = button("Save details", saveDetails, { className: "primary", disabled: !d.changed });
    const stateRows = d.state.map((row, index) => {
      const key = el("input", { value: row.key, placeholder: "trust" });
      key.oninput = () => { row.key = key.value; touch(); };
      const value = el("input", { type: "number", min: 0, max: 100, value: row.value });
      value.oninput = () => { row.value = Number(value.value); touch(); };
      return el("div", { className: "story-row" }, [key, value, button("Remove", () => { d.state.splice(index, 1); d.changed = true; render(); }, { className: "danger" })]);
    });
    const toneRows = d.tones.map((row, index) => {
      const tone = el("input", { value: row.tone, placeholder: "warm" });
      tone.oninput = () => { row.tone = tone.value; touch(); };
      const when = el("input", { value: row.when, placeholder: "always (the last row)" });
      const mark = el("small", {});
      const check = () => {
        if (!when.value.trim()) return (mark.textContent = "");
        try {
          parseCondition(when.value.trim());
          mark.textContent = "✓";
          mark.className = "ok";
        } catch (error) {
          mark.textContent = `✗ ${error.message}`;
          mark.className = "bad";
        }
      };
      when.oninput = () => { row.when = when.value; touch(); check(); };
      check();
      return el("div", { className: "story-row story-condition" }, [tone, when, mark, button("Remove", () => { d.tones.splice(index, 1); d.changed = true; render(); }, { className: "danger" })]);
    });
    const voiceModels = (vault().models ?? []).filter((model) => model.kind === "voice");
    const service = el("select", {}, [["kokoro", "Kokoro (fal) · $0.02 per 1,000 characters"], ["elevenlabs", "ElevenLabs · accents · $0.05–0.10 per 1,000"], ...voiceModels.map((model) => [model.id, `${model.id} (${model.service}, from the Library)${model.cost != null ? ` · $${model.cost} per 1,000` : ""}`])].map(([value, label]) => el("option", { value, textContent: label, selected: value === d.voiceService })));
    service.onchange = () => {
      d.voiceService = service.value;
      d.voice = "";
      d.changed = true;
      render();
    };
    let voiceChoices = d.voiceService === "kokoro" ? KOKORO_VOICES.map((id) => [id, id]) : [];
    if (d.voiceService === "elevenlabs") {
      if (elevenVoices === null && host?.studio) {
        elevenVoices = [];
        host.studio("voices", {}).then((result) => {
          elevenVoices = result.ok ? result.voices ?? [] : [];
          if (!result.ok) status = `ElevenLabs voices: ${result.error}`;
          render();
        });
      }
      voiceChoices = (elevenVoices ?? []).map((item) => [item.id, `${item.name}${item.accent ? ` · ${item.accent}` : ""}${item.gender ? ` · ${item.gender}` : ""}`]);
      if (d.voice && !voiceChoices.some(([id]) => id === d.voice)) voiceChoices.unshift([d.voice, d.voice]);
    }
    const libraryVoice = !["kokoro", "elevenlabs"].includes(d.voiceService);
    // A library voice model: its voice is whatever that model calls one, typed in.
    const voice = libraryVoice
      ? el("input", { value: d.voice, placeholder: "the voice name or id the model takes" })
      : el("select", {}, [el("option", { value: "", textContent: d.voiceService === "elevenlabs" && !keyed.has("elevenlabs") ? "(add an ElevenLabs key in Library → Keys first)" : "(the free live voice)" }), ...voiceChoices.map(([id, label]) => el("option", { value: id, textContent: label, selected: id === d.voice }))]);
    voice.onchange = () => { d.voice = voice.value; touch(); };
    if (libraryVoice) voice.oninput = voice.onchange;
    const speed = el("input", { type: "number", min: 0.5, max: 2, step: 0.01, value: d.voiceSpeed });
    speed.oninput = () => { d.voiceSpeed = Number(speed.value) || 1; touch(); };
    const voiceModel = el("select", {}, [["eleven_multilingual_v2", "Multilingual v2 · $0.10 per 1,000"], ["eleven_flash_v2_5", "Flash v2.5 · $0.05 per 1,000"]].map(([value, label]) => el("option", { value, textContent: label, selected: value === d.voiceModel })));
    voiceModel.onchange = () => { d.voiceModel = voiceModel.value; touch(); };
    return el("div", { className: "characters-details" }, [
      field("Name", text("name")),
      field("Role", text("role", { placeholder: "Publisher of Vellum & Vine" })),
      field("How they talk (Style)", text("style", { rows: 4 }), "The AI reads this when it picks what they do."),
      el("h3", { textContent: "Moods (State)" }),
      el("p", { className: "story-hint", textContent: "Their own moods, 0 to 100, and where each starts. Actions and scenes change them; conditions read them as state.<name>." }),
      ...stateRows,
      button("＋ Add a mood", () => { d.state.push({ key: "", value: 50 }); d.changed = true; render(); }),
      el("h3", { textContent: "Tones" }),
      el("p", { className: "story-hint", textContent: "The first row whose condition holds sets the tone, which picks their lines and their face. Leave the last row's condition empty." }),
      ...toneRows,
      button("＋ Add a tone", () => { d.tones.push({ tone: "", when: "" }); d.changed = true; render(); }),
      el("h3", { textContent: "Voice" }),
      field("Voice service", service),
      field("Recorded voice", voice, "Lines are recorded once with npm run voices:silver, when the dialogue is final."),
      d.voiceService === "elevenlabs" ? field("ElevenLabs model", voiceModel) : d.voiceService === "kokoro" ? field("Speed", speed) : null,
      el("div", { className: "story-row" }, [saveButton])
    ]);
  }

  function art() {
    if (!canvasPath()) return el("p", { className: "story-hint", textContent: "This character has no art canvas." });
    const newName = el("input", { placeholder: `new card name, such as ${current.toLowerCase()}-photo` });
    const importNew = button("Import a picture as a new card", () => {
      const name = newName.value.trim().toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
      if (!name) return fail("Give the new card a name first.");
      importInto(name, true);
    });
    return el("div", {}, [
      el("p", { className: "story-hint", textContent: `${canvasPath()} · Make calls the selected AI service and costs money (it asks first, with the price). Cut-outs, crops, composites and Redo finish are free. An imported picture becomes the card's result, so the cards that build on it work as usual.` }),
      el("div", { className: "story-row" }, [newName, importNew]),
      el("div", { className: "art-grid" }, cards().map(tile))
    ]);
  }

  /** The styles on this card (click one to turn it off), and the others to turn on. */
  function styleChips(card) {
    const library = vault().styles?.library ?? [];
    const local = vault().styles?.byCanvas?.[canvasPath()] ?? [];
    const names = [...new Set([...library.map((style) => style.name), ...local.map((style) => style.name)])];
    const on = new Set(card.styles.map((style) => style.name));
    return el("div", { className: "story-field" }, [el("span", { textContent: "Styles" }), el("div", { className: "chips" }, names.map((name) => button(name, () => toggleStyle(card, name, !on.has(name)), {
      className: `chip${on.has(name) ? " on" : ""}`,
      title: on.has(name) ? "On: click to turn it off" : "Off: click to add it to this card"
    })))]);
  }

  /** Turns a style on for a card (copying the library card onto this canvas the first time) or off. */
  async function toggleStyle(card, name, turnOn) {
    const local = (vault().styles?.byCanvas?.[canvasPath()] ?? []).find((style) => style.name === name);
    const edits = { boxes: [] };
    if (!turnOn) {
      const linked = card.styles.find((style) => style.name === name);
      edits.unlinks = [{ from: linked.node, to: card.node }];
    } else if (local) {
      edits.links = [{ from: local.node, to: card.node, label: "style" }];
    } else {
      const source = (vault().styles?.library ?? []).find((style) => style.name === name);
      const node = `style-${name}-${Date.now().toString(36)}`;
      edits.add = [{ node, text: source.text, x: card.x - 700, y: card.y, width: 560, height: 300 }];
      edits.links = [{ from: node, to: card.node, label: "style" }];
    }
    const result = await host.saveEdits({ canvases: { [canvasPath()]: edits }, notes: {}, since: since() });
    if (result.error) return fail(`Could not change the styles: ${result.error}`);
    if (result.conflicts?.length) return fail(`${canvasPath()} changed on disk. Close and open the workspace again.`);
    lastSave = new Date().toISOString();
    await reloadVault?.();
    fail(`${name} is ${turnOn ? "on" : "off"} for ${card.name}.`);
  }

  /** The card's own LoRAs (with strength), and the library's to add. */
  function loraChips(card, takesLoras) {
    const save = (list) => saveCard(card, { lora: list.length ? list : null });
    const pick = el("select", {}, [el("option", { value: "", textContent: (vault().loras ?? []).length ? "＋ add a LoRA…" : "(add LoRAs in Library → LoRAs)" }), ...(vault().loras ?? []).map((lora) => el("option", { value: lora.id, textContent: `${lora.id}${lora.trigger ? ` (${lora.trigger})` : ""}` }))]);
    pick.onchange = () => {
      const lora = (vault().loras ?? []).find((item) => item.id === pick.value);
      // Picked again: it replaces the card's own entry for that LoRA.
      if (lora) save([...card.loras.filter((entry) => entry.split(/\s+@/)[0] !== lora.id), `${lora.id} @${lora.scale ?? 1}`]);
    };
    const chips = card.loras.map((entry, index) => {
      const [name, scale = "1"] = entry.split(/\s+@\s*/);
      const strength = el("input", { type: "number", step: 0.05, min: -4, max: 4, value: Number(scale), title: "Strength" });
      strength.onchange = () => save(card.loras.map((item, at) => (at === index ? `${name} @${Number(strength.value) || 0}` : item)));
      return el("span", { className: "chip on" }, [name, strength, button("✕", () => save(card.loras.filter((_, at) => at !== index)), { title: "Remove" })]);
    });
    return el("div", { className: "story-field" }, [
      el("span", { textContent: takesLoras ? "LoRAs" : "LoRAs (this model takes none; pick a LoRA model such as flux-lora)" }),
      el("div", { className: "chips" }, [...chips, pick])
    ]);
  }

  function tile(card) {
    const working = busy.has(card.name);
    const models = (vault().models ?? []).filter((model) => model.kind === MODEL_KIND[card.kind]);
    const picture = card.output
      ? el(/\.(mp4)$/i.test(card.output) ? "video" : "img", { src: card.output, alt: "", loading: "lazy", muted: true, loop: true, autoplay: true })
      : el("div", { className: "art-empty", textContent: card.kind === "style" ? "style" : "not made yet" });
    const rows = [
      el("div", { className: "art-picture" }, [picture]),
      el("div", { className: "art-title" }, [el("strong", { textContent: card.name }), el("span", { className: `art-kind art-${card.status}`, textContent: `${card.kind} · ${working ? "working…" : card.status}` })]),
      card.from.length ? el("small", { className: "art-from", textContent: `from ${card.from.join(", ")}` }) : null,
      card.error ? el("small", { className: "art-error", textContent: card.error }) : null
    ];
    if (models.length) {
      const select = el("select", {}, [
        ...(card.model && !models.some((model) => model.id === card.model) ? [el("option", { value: card.model, textContent: card.model, selected: true })] : []),
        ...models.map((model) => el("option", { value: model.id, disabled: !keyed.has(model.service) && model.id !== card.model, textContent: `${model.id} · ${model.service} · $${model.cost}${model.per === "second" ? "/s" : ""}${keyed.has(model.service) ? "" : " · no key"}`, selected: model.id === card.model }))
      ]);
      select.onchange = () => saveCard(card, { model: select.value });
      rows.push(field("Model", select));
      // FLUX 3's own safety setting: 0 strictest … 4 most permissive (fal's default is 2).
      if (modelFor(card.model)?.shape === "flux3") {
        const safety = el("select", {}, [["", "2 (fal's default)"], ...["0", "1", "3", "4"].map((value) => [value, value])].map(([value, label]) => el("option", { value, textContent: label, selected: String(card.fields.safety ?? "") === value })));
        safety.onchange = () => saveCard(card, { safety: safety.value === "" ? null : Number(safety.value) });
        rows.push(field("Safety tolerance (0 strictest, 4 most permissive)", safety));
      }
    }
    if (["image", "edit", "animate"].includes(card.kind)) {
      const prompt = el("textarea", { rows: 4, value: card.prompt });
      prompt.onchange = () => saveCard(card, { prompt: prompt.value.trim() });
      rows.push(field("Prompt", prompt), styleChips(card));
      const model = modelFor(card.model);
      const takesLoras = card.kind === "image" && (model ? (model.loras ?? ["flux-lora", "flux-2-lora"].includes(model.id)) || (model.added && model.service === "replicate" && model.loras) : true);
      if (takesLoras || card.loras.length) rows.push(loraChips(card, takesLoras));
    }
    const actions = [];
    if (FREE.has(card.kind)) actions.push(button("Make (free)", () => make(card), { disabled: working }));
    else {
      const price = cost(card);
      actions.push(button(`Make${price ? ` · $${price.toFixed(3)}` : ""}`, () => make(card), { disabled: working, className: "primary" }));
      if (card.output) actions.push(button("Redo finish", () => make(card, { refinish: true }), { disabled: working, title: "Free: redo the crunch and its clean twin from the saved original" }));
    }
    if (["image", "edit"].includes(card.kind)) actions.push(button("Import picture", () => importInto(card), { disabled: working, title: "A picture made by hand or elsewhere becomes this card's result" }));
    rows.push(el("div", { className: "story-row" }, actions));
    return el("div", { className: `art-tile${working ? " working" : ""}` }, rows);
  }

  // ---------------------------------------------------------------- open / close

  function show() {
    open = true;
    root.hidden = false;
    current ??= characters()[0]?.id ?? null;
    draft = readDraft();
    status = "";
    render();
    // Which services have a key, so their models can be picked.
    host?.studio?.("keys", {}).then((result) => {
      if (!result?.ok) return;
      keyed = new Set(result.services.filter((service) => service.hasKey).map((service) => service.id));
      render();
    });
  }

  function close() {
    if (!open) return;
    if (draft?.changed && !confirm("Leave without saving these details?")) return;
    open = false;
    root.hidden = true;
    onClose();
  }

  window.addEventListener("keydown", (event) => {
    if (!open) return;
    if (event.key === "Escape" && !event.target.closest?.("input, textarea, select")) {
      event.preventDefault();
      close();
    }
  }, true);

  return {
    get open() { return open; },
    show,
    close
  };
}
