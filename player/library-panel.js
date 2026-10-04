// The Library: everything the art and voice tools can use, in one place.
// Opened from the screen editor (Cmd+E → Library).
//
//   Keys    a key for each service (written to .env by the app; the page only
//           learns whether one is set)
//   Models  the built-in models, and models you add: anything hosted on fal
//           or Replicate that makes pictures, edits, video or voices
//   LoRAs   LoRAs from Civitai, Hugging Face or a direct link, with their
//           trigger words and strength
//   Styles  style cards: words before and after a prompt (or a template
//           around it), and LoRAs; turned on per card in the Characters
//           workspace

const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...[].concat(children).filter((child) => child !== null && child !== undefined && child !== false));
  return node;
};
const button = (text, onClick, extra = {}) => el("button", { type: "button", textContent: text, onclick: onClick, ...extra });
const LINKS = {
  falModels: "https://fal.ai/models",
  replicateModels: "https://replicate.com/explore",
  civitaiLoras: "https://civitai.com/models?types=LORA",
  huggingfaceLoras: "https://huggingface.co/models?other=lora"
};

export function createLibraryPanel({ session, host, reloadVault, onClose = () => {} }) {
  let open = false;
  let tab = "keys";
  let services = [];
  let notes = {};
  let status = "";
  let editing = null; // the model, LoRA or style being edited (a copy), or null
  let lastSave = null;
  const root = el("div", { className: "story-editor library-panel", hidden: true });
  document.body.append(root);

  const vault = () => session.vault;
  const added = () => (vault().models ?? []).filter((model) => model.added);
  const strip = ({ added: _added, ...model }) => model;
  const since = () => (lastSave && lastSave > vault().builtAt ? lastSave : vault().builtAt);
  const fail = (text) => {
    status = text;
    render();
  };
  const needsApp = () => !host?.studio && fail("This works in the desktop app (npm run app).");

  // ---------------------------------------------------------------- keys

  async function loadKeys() {
    if (!host?.studio) return;
    const result = await host.studio("keys", {});
    services = result.services ?? [];
    render();
  }

  async function saveKey(service, key) {
    const result = await host.studio("setKey", { service: service.id, key });
    if (!result.ok) notes[service.id] = `✗ ${result.error}`;
    else {
      services = result.services ?? services;
      notes[service.id] = key ? "Saved. Test it to check." : "Removed.";
    }
    render();
  }

  async function testKey(service) {
    notes[service.id] = "Testing…";
    render();
    const result = await host.studio("testKey", { service: service.id });
    notes[service.id] = `${result.ok ? "✓" : "✗"} ${result.message ?? result.error ?? ""}`;
    render();
  }

  function keysTab() {
    if (!host?.studio) return [el("p", { className: "story-hint", textContent: "Keys are set in the desktop app (npm run app), or in the .env file." })];
    return [
      el("p", { className: "story-hint", textContent: "Each service needs its own key. Keys are saved in this project's .env file, which is never committed or shown in the game. A service's models can be picked once its key is set." }),
      ...services.map((service) => {
        const input = el("input", { type: "password", placeholder: service.hasKey ? "set: paste a new key to replace it" : "paste your key", autocomplete: "off", spellcheck: false });
        return el("div", { className: "key-row" }, [
          el("div", { className: "key-name" }, [
            el("strong", { textContent: service.name }),
            el("span", { className: service.hasKey ? "key-set" : "key-unset", textContent: service.hasKey ? "key set" : "no key" }),
            el("small", { textContent: service.uses })
          ]),
          el("div", { className: "story-row" }, [
            input,
            button("Save", () => input.value.trim() && saveKey(service, input.value.trim()), { className: "primary" }),
            button("Test", () => testKey(service), { disabled: !service.hasKey }),
            service.hasKey ? button("Remove", () => confirm(`Remove the ${service.name} key from .env?`) && saveKey(service, ""), { className: "danger" }) : null
          ]),
          el("div", { className: "story-row" }, [
            el("a", { href: service.site, target: "_blank", rel: "noopener", textContent: `Get a ${service.name} key ↗` }),
            el("small", { className: "key-note", textContent: notes[service.id] ?? "" })
          ])
        ]);
      })
    ];
  }

  // ---------------------------------------------------------------- models and LoRAs

  async function saveList(kind, list) {
    if (needsApp()) return;
    const result = await host.studio("saveLibrary", { [kind]: list });
    if (!result.ok) return fail(`Not saved: ${result.error}`);
    await reloadVault?.();
    editing = null;
    fail(`Saved library/${kind}.json.`);
  }

  function field(label, input, hint) {
    return el("label", { className: "story-field" }, [el("span", { textContent: label }), input, hint ? el("small", { textContent: hint }) : null]);
  }
  /** An input bound to editing[key]. */
  function bound(key, props = {}) {
    const input = el(props.rows ? "textarea" : "input", { value: editing[key] ?? "", ...props });
    input.oninput = () => (editing[key] = props.type === "number" ? (input.value === "" ? null : Number(input.value)) : input.value);
    return input;
  }
  function choice(key, options, onChange = () => {}) {
    const input = el("select", {}, options.map(([value, label]) => el("option", { value, textContent: label, selected: value === editing[key] })));
    input.onchange = () => {
      editing[key] = input.value;
      onChange();
    };
    return input;
  }

  function modelForm() {
    const m = editing;
    const isNew = !added().some((model) => model.id === m.originalId);
    const params = el("textarea", { rows: 3, value: m.params ? JSON.stringify(m.params, null, 1) : "", placeholder: '{ "num_inference_steps": 28 }' });
    const saveIt = () => {
      let parsed = null;
      try {
        parsed = params.value.trim() ? JSON.parse(params.value) : null;
      } catch {
        return fail("Extra inputs must be JSON, such as { \"steps\": 28 }.");
      }
      const model = Object.fromEntries(Object.entries({ ...m, params: parsed }).filter(([key, value]) => key !== "originalId" && value !== "" && value !== null && value !== undefined));
      if (model.service === "fal") delete model.model;
      if (model.service === "replicate") delete model.endpoint;
      const list = added().filter((item) => item.id !== m.originalId).map(strip);
      saveList("models", [...list, model]);
    };
    return el("div", { className: "library-form" }, [
      el("h3", { textContent: isNew ? "Add a model" : `Edit ${m.originalId}` }),
      field("Id (what cards use as model:)", bound("id", { placeholder: "flux-dev-ultra" })),
      field("Service", choice("service", [["fal", "fal"], ["replicate", "Replicate"]], render)),
      field("Makes", choice("kind", [["image", "pictures"], ["edit", "edits of a picture"], ["video", "video from a picture"], ["voice", "voices"]], render)),
      m.service === "fal"
        ? field("fal endpoint", bound("endpoint", { placeholder: "fal-ai/flux/dev" }), "From the model's fal page: the part after fal.ai/models/.")
        : field("Replicate model", bound("model", { placeholder: "black-forest-labs/flux-dev (or owner/name:version)" })),
      field(m.kind === "voice" ? "Cost per 1,000 characters ($)" : `Cost per ${m.kind === "video" ? "second" : "picture"} ($)`, bound("cost", { type: "number", min: 0, step: 0.001 })),
      m.kind === "edit" || m.kind === "video" ? field("Picture input name", bound("imageField", { placeholder: m.service === "fal" ? (m.kind === "edit" ? "image_urls" : "image_url") : m.kind === "edit" ? "input_image" : "start_image" }), "The model's field for the input picture, if it is not the usual one.") : null,
      m.kind === "voice" ? field("Text input name", bound("textField", { placeholder: "text" })) : null,
      m.kind === "voice" ? field("Voice input name", bound("voiceField", { placeholder: "voice" })) : null,
      m.kind === "image" ? el("label", { className: "story-field check" }, [
        (() => {
          const box = el("input", { type: "checkbox", checked: Boolean(m.loras) });
          box.onchange = () => (editing.loras = box.checked);
          return box;
        })(),
        el("span", { textContent: m.service === "fal" ? "Takes LoRAs (a loras list, like fal's FLUX LoRA models)" : "Takes a LoRA (lora_weights / lora_scale)" })
      ]) : null,
      field("Extra inputs (JSON)", params, "Sent with every call, such as steps or guidance."),
      el("div", { className: "story-row" }, [button("Save model", saveIt, { className: "primary" }), button("Cancel", () => { editing = null; render(); })])
    ]);
  }

  function modelsTab() {
    if (editing?.section === "models") return [modelForm()];
    const rows = (vault().models ?? []).map((model) => el("tr", {}, [
      el("td", { textContent: model.id }),
      el("td", { textContent: model.service }),
      el("td", { textContent: model.kind }),
      el("td", { textContent: model.cost != null ? `$${model.cost}${model.per === "second" ? "/s" : model.kind === "voice" ? "/1k" : ""}` : "" }),
      el("td", {}, model.added ? [
        button("Edit", () => { editing = { section: "models", ...structuredClone(strip(model)), originalId: model.id }; render(); }),
        button("Delete", () => confirm(`Delete the model ${model.id} from the library? Cards using it will need another.`) && saveList("models", added().filter((item) => item.id !== model.id).map(strip)), { className: "danger" })
      ] : [el("small", { textContent: "built in" })])
    ]));
    return [
      el("p", { className: "story-hint", textContent: "Any model hosted on fal or Replicate can be added. Cards pick a model in the Characters workspace (Art). Video and voices from Replicate are not supported yet." }),
      el("div", { className: "story-row" }, [
        button("＋ Add a model", () => { editing = { section: "models", id: "", service: "fal", kind: "image", endpoint: "", model: "", cost: null, originalId: null }; render(); }, { className: "primary" }),
        el("a", { href: LINKS.falModels, target: "_blank", rel: "noopener", textContent: "Browse fal models ↗" }),
        el("a", { href: LINKS.replicateModels, target: "_blank", rel: "noopener", textContent: "Browse Replicate ↗" })
      ]),
      el("table", { className: "library-table" }, [el("tr", {}, ["Model", "Service", "Makes", "Cost", ""].map((text) => el("th", { textContent: text }))), ...rows])
    ];
  }

  function loraForm() {
    const isNew = !(vault().loras ?? []).some((lora) => lora.id === editing.originalId);
    const saveIt = () => {
      const lora = Object.fromEntries(Object.entries(editing).filter(([key, value]) => !["section", "originalId", "url", "source"].includes(key) && value !== "" && value !== null && value !== undefined));
      const list = (vault().loras ?? []).filter((item) => item.id !== editing.originalId);
      saveList("loras", [...list, lora]);
    };
    return el("div", { className: "library-form" }, [
      el("h3", { textContent: isNew ? "Add a LoRA" : `Edit ${editing.originalId}` }),
      field("Id (what cards and styles use)", bound("id", { placeholder: "vhs-look" })),
      field("Name", bound("name", { placeholder: "VHS look" })),
      field("Link", bound("link", { placeholder: "https://civitai.com/models/123?modelVersionId=456, or a Hugging Face .safetensors link" }), "Paste the page link: Civitai (the version's page) or Hugging Face (the .safetensors file). Nothing is downloaded here; fal or Replicate fetch the LoRA from its file link when a card runs. Some Civitai LoRAs need a Civitai key (Keys)."),
      field("Trigger words", bound("trigger", { placeholder: "vhs footage" }), "Added to the start of the prompt when the LoRA is on."),
      field("Strength", bound("scale", { type: "number", min: -4, max: 4, step: 0.05 })),
      field("Made for", bound("base", { placeholder: "FLUX.1 dev" }), "A note: LoRAs only work with the model family they were trained for."),
      el("div", { className: "story-row" }, [button("Save LoRA", saveIt, { className: "primary" }), button("Cancel", () => { editing = null; render(); })])
    ]);
  }

  function lorasTab() {
    if (editing?.section === "loras") return [loraForm()];
    const loras = vault().loras ?? [];
    return [
      el("p", { className: "story-hint", textContent: "LoRAs change a model's look. Add them here, then turn them on for a card (Characters → Art) or in a style (Styles). They work with models that take LoRAs, such as flux-lora." }),
      el("div", { className: "story-row" }, [
        button("＋ Add a LoRA", () => { editing = { section: "loras", id: "", name: "", link: "", trigger: "", scale: 1, base: "", originalId: null }; render(); }, { className: "primary" }),
        el("a", { href: LINKS.civitaiLoras, target: "_blank", rel: "noopener", textContent: "Find LoRAs on Civitai ↗" }),
        el("a", { href: LINKS.huggingfaceLoras, target: "_blank", rel: "noopener", textContent: "Find LoRAs on Hugging Face ↗" })
      ]),
      loras.length
        ? el("table", { className: "library-table" }, [el("tr", {}, ["LoRA", "From", "Trigger", "Strength", ""].map((text) => el("th", { textContent: text }))), ...loras.map((lora) => el("tr", {}, [
          el("td", { textContent: `${lora.id}${lora.name ? ` · ${lora.name}` : ""}` }),
          el("td", { textContent: lora.source }),
          el("td", { textContent: lora.trigger ?? "" }),
          el("td", { textContent: String(lora.scale) }),
          el("td", {}, [
            button("Edit", () => { editing = { section: "loras", ...structuredClone(lora), originalId: lora.id }; render(); }),
            button("Delete", () => confirm(`Delete the LoRA ${lora.id}?`) && saveList("loras", loras.filter((item) => item.id !== lora.id)), { className: "danger" })
          ])
        ]))])
        : el("p", { className: "story-hint", textContent: "No LoRAs yet." })
    ];
  }

  // ---------------------------------------------------------------- styles

  /** Saves a style card on Assets.canvas: its words and LoRAs (new styles are added). */
  async function saveStyle() {
    if (!host?.saveEdits) return fail("Saving works in the desktop app (npm run app).");
    const s = editing;
    const name = String(s.name ?? "").trim().toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
    if (!name) return fail("Give the style a name.");
    const fields = { prefix: s.prefix?.trim() || null, suffix: s.suffix?.trim() || null, template: s.template?.trim() || null, lora: s.lora?.length ? s.lora : null };
    if (fields.template && !fields.template.includes("{prompt}")) return fail("A template must have {prompt} where the card's prompt goes.");
    const edits = { boxes: [] };
    if (s.node) edits.recipes = [{ node: s.node, fields }];
    else {
      if ((vault().styles?.library ?? []).some((style) => style.name === name)) return fail(`There is already a style called ${name}.`);
      const lines = [`## ${name}`, "style", ...(s.note ? [`# ${s.note}`] : []), ...Object.entries(fields).filter(([, value]) => value).map(([key, value]) => `${key}: ${typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value)}`)];
      edits.add = [{ node: `style-${name}-${Date.now().toString(36)}`, text: lines.join("\n"), x: -1400, y: 0, width: 560, height: 320 }];
    }
    const result = await host.saveEdits({ canvases: { "Assets.canvas": edits }, notes: {}, since: since() });
    if (result.error) return fail(`Not saved: ${result.error}`);
    if (result.conflicts?.length) return fail("Assets.canvas changed on disk. Close and open the Library again.");
    lastSave = new Date().toISOString();
    await reloadVault?.();
    editing = null;
    fail(`Saved the style ${name}. Copies already on art canvases keep their old words until you turn the style off and on again.`);
  }

  function styleForm() {
    const s = editing;
    const loraPick = el("select", {}, [el("option", { value: "", textContent: "＋ add a LoRA…" }), ...(vault().loras ?? []).map((lora) => el("option", { value: lora.id, textContent: `${lora.id}${lora.trigger ? ` (${lora.trigger})` : ""}` }))]);
    loraPick.onchange = () => {
      if (!loraPick.value) return;
      const lora = (vault().loras ?? []).find((item) => item.id === loraPick.value);
      s.lora = [...(s.lora ?? []), `${lora.id} @${lora.scale ?? 1}`];
      render();
    };
    return el("div", { className: "library-form" }, [
      el("h3", { textContent: s.node ? `Edit the style ${s.name}` : "Add a style" }),
      s.node ? null : field("Name", bound("name", { placeholder: "noir-night" })),
      s.node ? null : field("What it is for", bound("note", { placeholder: "Night scenes in a 1990s noir look. Use with z-image." })),
      field("Before the prompt", bound("prefix", { rows: 2, placeholder: "A still frame from a 1995 CD-ROM game, …" })),
      field("After the prompt", bound("suffix", { rows: 2, placeholder: "no people, no text" })),
      field("Or a template around it", bound("template", { rows: 2, placeholder: "The person {prompt}, keeping the same expression…" }), "Optional. {prompt} is where the card's prompt goes."),
      el("div", { className: "story-field" }, [el("span", { textContent: "LoRAs" }), el("div", { className: "chips" }, [
        ...(s.lora ?? []).map((entry, index) => el("span", { className: "chip" }, [entry, button("✕", () => { s.lora.splice(index, 1); render(); }, { title: "Remove" })])),
        loraPick
      ])]),
      el("div", { className: "story-row" }, [button("Save style", saveStyle, { className: "primary" }), button("Cancel", () => { editing = null; render(); })])
    ]);
  }

  function stylesTab() {
    if (editing?.section === "styles") return [styleForm()];
    const library = vault().styles?.library ?? [];
    return [
      el("p", { className: "story-hint", textContent: "A style adds words to a card's plain prompt to give it a look, and can turn on LoRAs. Styles live on Assets.canvas; in the Characters workspace, turn styles on for each card." }),
      el("div", { className: "story-row" }, [button("＋ Add a style", () => { editing = { section: "styles", name: "", note: "", prefix: "", suffix: "", template: "", lora: [] }; render(); }, { className: "primary" })]),
      el("div", { className: "style-list" }, library.map((style) => el("div", { className: "style-card" }, [
        el("strong", { textContent: style.name }),
        style.note ? el("small", { textContent: style.note }) : null,
        style.template ? el("p", { textContent: `Template: ${style.template}` }) : null,
        style.prefix ? el("p", { textContent: `Before: ${style.prefix}` }) : null,
        style.suffix ? el("p", { textContent: `After: ${style.suffix}` }) : null,
        [].concat(style.lora ?? []).length ? el("p", { textContent: `LoRAs: ${[].concat(style.lora).join(", ")}` }) : null,
        button("Edit", () => { editing = { section: "styles", node: style.node, name: style.name, prefix: style.prefix ?? "", suffix: style.suffix ?? "", template: style.template ?? "", lora: [].concat(style.lora ?? []).map(String) }; render(); })
      ])))
    ];
  }

  // ---------------------------------------------------------------- drawing

  function render() {
    if (!open) return;
    const tabs = el("div", { className: "editor-add-tabs" }, [["keys", "Keys"], ["models", "Models"], ["loras", "LoRAs"], ["styles", "Styles"]].map(([id, label]) => button(label, () => { tab = id; editing = null; status = ""; render(); }, { className: tab === id ? "on" : "" })));
    const body = { keys: keysTab, models: modelsTab, loras: lorasTab, styles: stylesTab }[tab]();
    root.replaceChildren(
      el("div", { className: "story-head" }, [el("strong", { textContent: "Library" }), el("span", { className: "story-status", textContent: status }), button("Close", close)]),
      el("div", { className: "keys-body library-body" }, [tabs, ...body])
    );
  }

  function show() {
    open = true;
    root.hidden = false;
    notes = {};
    status = "";
    editing = null;
    render();
    loadKeys();
  }

  function close() {
    if (editing && !confirm("Leave without saving?")) return;
    editing = null;
    open = false;
    root.hidden = true;
    onClose();
  }

  window.addEventListener("keydown", (event) => {
    if (open && event.key === "Escape" && !event.target.closest?.("input, textarea, select")) close();
  }, true);

  return { get open() { return open; }, show, close };
}
