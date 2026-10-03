// Reads a character from the compiled vault (ENGINE_SPEC.md section 5): the
// character note, its profiles, its actions, and its dialogue notes. The
// result has the same shape the encounter has always used (data/arthur.json,
// data/dialogue.json, the old profile table), so the line picker and the
// performance code work unchanged. Pure: no DOM, no files.

const STATE_KEYS = ["trust", "suspicion", "irritation", "fear"];
const PERSONALITY_KEYS = ["patience", "greed", "courage", "sympathy", "ruleFollowing"];

const bulletsOf = (text = "") =>
  text
    .split("\n")
    .filter((line) => /^- /.test(line))
    .map((line) => line.slice(2).trim());

/** One bullet is a line; several are variants. */
const lineValue = (bullets) => (bullets.length === 1 ? bullets[0] : bullets);

const pick = (source, keys) =>
  Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));

function section(note, title) {
  return note?.sections?.find((item) => item.title === title) ?? null;
}

/** Links listed as bullets under a heading, such as "## Actions". */
export function listedIds(note, title) {
  return bulletsOf(section(note, title)?.text).map((item) => item.replace(/^\[\[|\]\]$/g, "").trim());
}

/** A branch's `when` list, back to the line picker's form. */
function branchWhen(conditions = []) {
  const when = {};
  for (const condition of [].concat(conditions)) {
    let match = String(condition).match(/^playerContains in \[(.*)\]$/);
    if (match) {
      when.playerContains = match[1].split(",").map((item) => item.trim()).filter(Boolean);
      continue;
    }
    match = String(condition).match(/^lastAction = (\S+)$/);
    if (match) {
      when.lastAction = match[1];
      continue;
    }
    match = String(condition).match(/^some memory\.tag in \[(.*)\]$/);
    if (match) {
      when.memoryTag = match[1].trim();
      continue;
    }
    match = String(condition).match(/^tone = (\S+)$/);
    if (match) {
      when.tone = match[1];
      continue;
    }
    throw new SyntaxError(`Unknown line branch condition: ${condition}`);
  }
  return when;
}

/**
 * The value of one line section: bullets (a line or variants), or a
 * template with `### slot` lists and `### branch: ...` blocks under it.
 */
function lineSection(sections, index) {
  const head = sections[index];
  const children = [];
  for (let next = index + 1; next < sections.length && sections[next].depth > head.depth; next += 1) {
    if (sections[next].depth === head.depth + 1) children.push(sections[next]);
  }
  const templates = head.text
    .split("\n")
    .filter((line) => line.startsWith("Template: "))
    .map((line) => line.slice("Template: ".length).trim());
  const variants = children.find((child) => child.title === "variants");
  if (variants) return variants.data;
  if (!templates.length && !children.length) return lineValue(bulletsOf(head.text));

  const value = {};
  if (templates.length === 1) value.template = templates[0];
  else if (templates.length > 1) value.templates = templates;
  const slots = children.filter((child) => !child.title.startsWith("branch:"));
  if (slots.length) value.slots = Object.fromEntries(slots.map((slot) => [slot.title, lineValue(bulletsOf(slot.text))]));
  const branches = children.filter((child) => child.title.startsWith("branch:"));
  if (branches.length) {
    value.branches = branches.map(({ data = {} }) => {
      const { when, ...rest } = data;
      return { when: branchWhen(when), ...rest };
    });
  }
  return value;
}

/** Each depth-2 section of a note, as [title, value]. */
function lineSections(note) {
  const sections = note?.sections ?? [];
  return sections.flatMap((item, index) => (item.depth === 2 ? [[item.title, lineSection(sections, index)]] : []));
}

/**
 * The line data for a character, in the shape of the old data/dialogue.json,
 * plus `lines`: every other line in its lines note (such as `id-shown`).
 */
export function buildDialogueData(vault, characterId) {
  const notes = vault.notes;
  const character = notes[characterId];
  const data = { opening: null, nameAcknowledgement: null, performance: { actions: {} }, actions: {}, profiles: {}, lines: {} };
  const profile = (id) => (data.profiles[id] ??= {});

  for (const actionId of listedIds(character, "Actions")) {
    const action = notes[actionId];
    const lines = notes[action?.props.dialogue];
    if (!lines) throw new Error(`${actionId} has no dialogue note`);
    data.actions[actionId] = {};
    for (const [title, value] of lineSections(lines)) {
      if (title.startsWith("@")) (profile(title.slice(1)).actions ??= {})[actionId] = value;
      else data.actions[actionId][title] = value;
    }
    const { portraitCue, sound, preDelayMs, reactionOutMs } = lines.props;
    const performance = {
      ...(portraitCue ? { portraitCue } : {}),
      ...(sound ? { soundEffect: sound } : {}),
      ...(preDelayMs ? { speech: { preDelayMs } } : {}),
      ...(reactionOutMs ? { timing: { reactionOutMs } } : {})
    };
    if (Object.keys(performance).length) data.performance.actions[actionId] = performance;
  }

  const linesNote = notes[character?.props.lines];
  for (const [title, value] of lineSections(linesNote)) {
    const [name, at] = title.split(/\s+@/);
    const key = { opening: "opening", "name-acknowledgement": "nameAcknowledgement" }[name];
    if (key && at) profile(at)[key] = value;
    else if (key) data[key] = value;
    else data.lines[title] = value;
  }
  return data;
}

/** A profile note in the old profile-table shape, plus its own extras. */
function buildProfile(note, id, stateKeys = STATE_KEYS) {
  const props = note.props;
  return {
    id,
    label: props.label,
    decisionStyle: section(note, "Decision style")?.text ?? "",
    personality: pick(props, PERSONALITY_KEYS),
    initialState: pick(props, stateKeys),
    speech: pick(props, ["rate", "pitch", "preDelayMs", "voice"]),
    address: props.address ?? id,
    trustThreshold: props.trustThreshold
  };
}

/** One action note: its rules, the model's criteria, and its line note id. */
function buildAction(note, id) {
  const judgment = section(note, "Judgment");
  return {
    id,
    ...note.props,
    criteria: section(note, "Criteria")?.text ?? "",
    alsoNeeds: note.blocks["Also needs"] ?? null,
    memory: note.blocks.Memory ?? [],
    mock: note.blocks.Mock ?? null,
    judgmentRule: judgment?.data ?? null
  };
}

/**
 * Everything the encounter needs about a character: `template` (the old
 * data/arthur.json shape), `profiles` (by id), `actions` (in the order the
 * character note lists them), its tones, scene, prompt, tree, and limits.
 */
export function buildCharacter(vault, characterId) {
  const notes = vault.notes;
  const note = notes[characterId];
  if (note?.type !== "character") throw new Error(`No character note named ${characterId}`);
  const props = note.props;
  const profileIds = listedIds(note, "Profiles");
  // A character may list its own state in a "## State" block (such as
  // { closeness: 20, temptation: 10 }); otherwise Arthur's four from Properties.
  const ownState = note.blocks.State && typeof note.blocks.State === "object" ? note.blocks.State : null;
  const stateKeys = ownState ? Object.keys(ownState) : STATE_KEYS;
  const actionIds = listedIds(note, "Actions");
  return {
    id: characterId,
    template: {
      id: String(props.id ?? characterId).toLowerCase(),
      name: props.name,
      role: props.role,
      cognition: { estimatedIq: props.iq, style: section(note, "Style")?.text ?? "" },
      personality: pick(props, PERSONALITY_KEYS),
      state: ownState ? { ...ownState } : pick(props, STATE_KEYS),
      goals: note.blocks.Goals ?? []
    },
    profiles: Object.fromEntries(profileIds.map((id) => [id, buildProfile(notes[id], id, stateKeys)])),
    stateKeys,
    profileIds,
    actions: actionIds.map((id) => buildAction(notes[id], id)),
    tones: note.blocks.Tones ?? [{ tone: "neutral" }],
    scene: note.blocks.Scene ?? {},
    prompt: note.blocks.Prompt ?? {},
    fallbackAction: props.fallbackAction,
    memoryMax: Number(props.memoryMax) || 8,
    historyMax: Number(props.historyMax) || 12,
    tree: props.tree ?? null,
    hasMockRules: actionIds.some((id) => notes[id]?.blocks.Mock),
    dialogue: buildDialogueData(vault, characterId)
  };
}
