const WEAPON_THREAT_PATTERN =
  /\b(gun|pistol|rifle|firearm|revolver|shotgun|weapon|armed|shoot(?:ing)?|aim(?:ing)?|bullet|trigger)\b/i;
const NAME_QUESTION_PATTERN =
  /\b(?:what(?:'s| is)\s+(?:your|ur)\s+name|tell me your name|who\s+are\s+you|what should I call you|who am I speaking to|identify yourself)\b/i;
const NAME_WORD_PATTERN = /\bname\b/i;
const NAME_QUESTION_WORD_PATTERN = /\b(?:what|who|which|is it|can you tell|tell me)\b/i;
const SHORT_NAME_QUESTION_PATTERN = /^\s*(?:name|your name)\s*[?!.]*\s*$/i;

export function isWeaponThreat(playerInput = "") {
  return WEAPON_THREAT_PATTERN.test(String(playerInput));
}

export function isNameQuestion(playerInput = "") {
  const input = String(playerInput);
  return (
    NAME_QUESTION_PATTERN.test(input) ||
    SHORT_NAME_QUESTION_PATTERN.test(input) ||
    (NAME_WORD_PATTERN.test(input) && NAME_QUESTION_WORD_PATTERN.test(input))
  );
}

function hasMemoryTag(dialogueContext, tag) {
  return dialogueContext.memories?.some((memory) => memory.tags?.includes(tag)) ?? false;
}

function matchesBranch(condition = {}, dialogueContext) {
  if (condition.tone && condition.tone !== dialogueContext.tone) return false;
  if (condition.memoryTag && !hasMemoryTag(dialogueContext, condition.memoryTag)) return false;

  if (condition.lastAction) {
    const lastAction = dialogueContext.history
      ?.filter((entry) => entry.speaker === "arthur")
      .at(-1)?.action;
    if (lastAction !== condition.lastAction) return false;
  }

  if (Array.isArray(condition.playerContains) && condition.playerContains.length > 0) {
    const input = String(dialogueContext.playerInput ?? "").toLowerCase();
    if (!condition.playerContains.some((phrase) => input.includes(String(phrase).toLowerCase()))) {
      return false;
    }
  }

  return true;
}

function resolveTemplate(value, variantIndex, dialogueContext) {
  const source = Array.isArray(value) ? value : [value];
  const authoredTemplate = source[Math.abs(variantIndex) % source.length];

  if (typeof authoredTemplate === "string") return authoredTemplate;
  if (!authoredTemplate || typeof authoredTemplate !== "object") return authoredTemplate;

  const matchingBranch = (authoredTemplate.branches ?? []).find((branch) =>
    matchesBranch(branch.when, dialogueContext)
  );
  const branch = matchingBranch ?? {};
  const template = branch.template ?? authoredTemplate.template;
  const templates = branch.templates ?? authoredTemplate.templates;
  const templateOptions = templates ?? template;

  if (!templateOptions) return null;

  const selectedTemplate = Array.isArray(templateOptions)
    ? templateOptions[Math.abs(variantIndex) % templateOptions.length]
    : templateOptions;
  const slots = { ...(authoredTemplate.slots ?? {}), ...(branch.slots ?? {}) };
  const selectedSlots = new Map();
  let slotOffset = 0;

  return String(selectedTemplate).replace(/\{([a-zA-Z][\w-]*)\}/g, (_match, slotName) => {
    if (!Object.hasOwn(slots, slotName)) {
      throw new Error(`Dialogue template references unknown slot: ${slotName}`);
    }

    if (!selectedSlots.has(slotName)) {
      const options = Array.isArray(slots[slotName]) ? slots[slotName] : [slots[slotName]];
      if (options.length === 0) throw new Error(`Dialogue slot is empty: ${slotName}`);
      const baseIndex = Math.abs(variantIndex);
      const slotIndex = baseIndex + (baseIndex > 0 ? slotOffset : 0);
      selectedSlots.set(slotName, options[slotIndex % options.length]);
      slotOffset += 1;
    }

    return selectedSlots.get(slotName);
  });
}

export function selectDialogue(
  dialogueData,
  action,
  tone,
  variantIndex = 0,
  { playerInput = "", dialogueContext = {} } = {}
) {
  const variants = dialogueData.actions[action];

  if (!variants) {
    throw new Error(`No authored dialogue exists for action: ${action}`);
  }

  const authoredValue =
    (isWeaponThreat(playerInput) && variants.weapon) ||
    (isNameQuestion(playerInput) && variants.name) ||
    variants[tone] ||
    variants.neutral;
  const context = {
    ...dialogueContext,
    tone,
    playerInput
  };
  const line = resolveTemplate(authoredValue, variantIndex, context);

  if (typeof line !== "string" || !line.trim()) {
    throw new Error(`No authored ${tone} or neutral line exists for action: ${action}`);
  }

  return line;
}
