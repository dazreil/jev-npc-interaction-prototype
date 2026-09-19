const TONES = new Set(["neutral", "friendly", "irritated", "hostile"]);
const VARIANT_KEYS = new Set([...TONES, "name", "weapon"]);
const TEMPLATE_KEYS = new Set(["template", "templates", "slots", "branches"]);
const BRANCH_KEYS = new Set(["when", "template", "templates", "slots"]);
const CONDITION_KEYS = new Set(["tone", "memoryTag", "lastAction", "playerContains"]);
const SLOT_PATTERN = /\{([a-zA-Z][\w-]*)\}/g;

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function placeholdersIn(template) {
  return [...String(template).matchAll(SLOT_PATTERN)].map((match) => match[1]);
}

function validateCondition(condition, path, availableActions, errors) {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
    errors.push(`${path} must be an object.`);
    return;
  }

  const keys = Object.keys(condition);
  if (keys.length === 0) errors.push(`${path} must contain at least one condition.`);

  for (const key of keys) {
    if (!CONDITION_KEYS.has(key)) errors.push(`${path}.${key} is not a supported condition.`);
  }

  if (condition.tone !== undefined && !TONES.has(condition.tone)) {
    errors.push(`${path}.tone must be neutral, friendly, irritated, or hostile.`);
  }
  if (condition.memoryTag !== undefined && !isNonEmptyString(condition.memoryTag)) {
    errors.push(`${path}.memoryTag must be a non-empty string.`);
  }
  if (condition.lastAction !== undefined && !availableActions.includes(condition.lastAction)) {
    errors.push(`${path}.lastAction must name an available action.`);
  }
  if (condition.playerContains !== undefined) {
    if (
      !Array.isArray(condition.playerContains) ||
      condition.playerContains.length === 0 ||
      condition.playerContains.some((value) => !isNonEmptyString(value))
    ) {
      errors.push(`${path}.playerContains must be a non-empty array of non-empty strings.`);
    }
  }
}

function validateSlots(rawSlots, path, errors, warnings, statistics) {
  if (rawSlots === undefined) return {};
  if (!rawSlots || typeof rawSlots !== "object" || Array.isArray(rawSlots)) {
    errors.push(`${path} must be an object.`);
    return {};
  }

  const slots = {};
  for (const [slotName, rawOptions] of Object.entries(rawSlots)) {
    if (!/^[a-zA-Z][\w-]*$/.test(slotName)) {
      errors.push(`${path}.${slotName} is not a valid slot name.`);
      continue;
    }

    const options = asArray(rawOptions);
    if (options.length === 0 || options.some((option) => !isNonEmptyString(option))) {
      errors.push(`${path}.${slotName} must contain at least one non-empty string.`);
      continue;
    }

    if (new Set(options).size !== options.length) {
      warnings.push(`${path}.${slotName} contains duplicate phrases.`);
    }

    slots[slotName] = options;
    statistics.authoredFragments += options.length;
  }
  return slots;
}

function validateTemplateSet({
  rawTemplate,
  rawTemplates,
  slots,
  localSlotNames,
  path,
  errors,
  warnings,
  statistics
}) {
  if (rawTemplate !== undefined && rawTemplates !== undefined) {
    errors.push(`${path} cannot define both template and templates.`);
  }

  const selected = rawTemplates ?? rawTemplate;
  if (selected === undefined) return { templates: null, usedSlots: new Set() };

  const templates = asArray(selected);
  if (templates.length === 0 || templates.some((template) => !isNonEmptyString(template))) {
    errors.push(`${path} must contain at least one non-empty template string.`);
    return { templates: [], usedSlots: new Set() };
  }

  if (new Set(templates).size !== templates.length) {
    warnings.push(`${path} contains duplicate templates.`);
  }

  statistics.templateEntries += 1;
  statistics.authoredFragments += templates.length;
  const usedSlots = new Set();

  for (const template of templates) {
    const placeholders = [...new Set(placeholdersIn(template))];
    let combinations = 1;
    for (const placeholder of placeholders) {
      usedSlots.add(placeholder);
      if (!slots[placeholder]) {
        errors.push(`${path} references missing slot {${placeholder}}.`);
        combinations = 0;
      } else {
        combinations *= slots[placeholder].length;
      }
    }
    statistics.possibleLines += combinations;
  }

  for (const slotName of localSlotNames) {
    if (!usedSlots.has(slotName)) warnings.push(`${path} defines unused slot ${slotName}.`);
  }

  return { templates, usedSlots };
}

function validateTemplateObject(value, path, availableActions, errors, warnings, statistics) {
  for (const key of Object.keys(value)) {
    if (!TEMPLATE_KEYS.has(key)) errors.push(`${path}.${key} is not supported in a template entry.`);
  }

  const baseSlots = validateSlots(value.slots, `${path}.slots`, errors, warnings, statistics);
  validateTemplateSet({
    rawTemplate: value.template,
    rawTemplates: value.templates,
    slots: baseSlots,
    localSlotNames: Object.keys(baseSlots),
    path,
    errors,
    warnings,
    statistics
  });

  if (value.template === undefined && value.templates === undefined) {
    errors.push(`${path} must define template or templates.`);
  }

  if (value.branches === undefined) return;
  if (!Array.isArray(value.branches) || value.branches.length === 0) {
    errors.push(`${path}.branches must be a non-empty array.`);
    return;
  }

  value.branches.forEach((branch, index) => {
    const branchPath = `${path}.branches[${index}]`;
    statistics.branchCount += 1;

    if (!branch || typeof branch !== "object" || Array.isArray(branch)) {
      errors.push(`${branchPath} must be an object.`);
      return;
    }

    for (const key of Object.keys(branch)) {
      if (!BRANCH_KEYS.has(key)) errors.push(`${branchPath}.${key} is not supported in a branch.`);
    }

    validateCondition(branch.when, `${branchPath}.when`, availableActions, errors);
    const branchSlots = validateSlots(
      branch.slots,
      `${branchPath}.slots`,
      errors,
      warnings,
      statistics
    );
    const mergedSlots = { ...baseSlots, ...branchSlots };
    const branchTemplates = validateTemplateSet({
      rawTemplate: branch.template ?? value.template,
      rawTemplates: branch.templates ?? (branch.template === undefined ? value.templates : undefined),
      slots: mergedSlots,
      localSlotNames: Object.keys(branchSlots),
      path: branchPath,
      errors,
      warnings,
      statistics
    }).templates;

    if (!branchTemplates) errors.push(`${branchPath} has no template to render.`);
  });
}

function validateDialogueValue(value, path, availableActions, errors, warnings, statistics) {
  statistics.variantEntries += 1;

  if (isNonEmptyString(value)) {
    statistics.authoredFragments += 1;
    statistics.possibleLines += 1;
    return;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      errors.push(`${path} must not be an empty array.`);
      return;
    }
    if (value.every(isNonEmptyString)) {
      if (new Set(value).size !== value.length) warnings.push(`${path} contains duplicate lines.`);
      statistics.authoredFragments += value.length;
      statistics.possibleLines += value.length;
      return;
    }
    errors.push(`${path} arrays must contain only non-empty strings.`);
    return;
  }

  if (value && typeof value === "object") {
    validateTemplateObject(value, path, availableActions, errors, warnings, statistics);
    return;
  }

  errors.push(`${path} must be a string, string array, or template object.`);
}

export function lintDialogueData(dialogueData, availableActions) {
  const errors = [];
  const warnings = [];
  const statistics = {
    actionCount: 0,
    variantEntries: 0,
    authoredFragments: 0,
    templateEntries: 0,
    branchCount: 0,
    possibleLines: 0
  };

  if (!dialogueData || typeof dialogueData !== "object" || Array.isArray(dialogueData)) {
    return { errors: ["Dialogue data must be an object."], warnings, statistics };
  }
  if (!isNonEmptyString(dialogueData.opening)) errors.push("opening must be a non-empty string.");
  if (!dialogueData.actions || typeof dialogueData.actions !== "object" || Array.isArray(dialogueData.actions)) {
    errors.push("actions must be an object.");
    return { errors, warnings, statistics };
  }

  const actionNames = Object.keys(dialogueData.actions);
  statistics.actionCount = actionNames.length;
  for (const action of availableActions) {
    if (!Object.hasOwn(dialogueData.actions, action)) errors.push(`actions.${action} is missing.`);
  }
  for (const action of actionNames) {
    if (!availableActions.includes(action)) errors.push(`actions.${action} is not an available action.`);
  }

  for (const [action, variants] of Object.entries(dialogueData.actions)) {
    const actionPath = `actions.${action}`;
    if (!variants || typeof variants !== "object" || Array.isArray(variants)) {
      errors.push(`${actionPath} must be an object.`);
      continue;
    }
    if (!Object.hasOwn(variants, "neutral")) errors.push(`${actionPath}.neutral is required.`);

    for (const [variantName, value] of Object.entries(variants)) {
      if (!VARIANT_KEYS.has(variantName)) {
        errors.push(`${actionPath}.${variantName} is not a supported dialogue variant.`);
        continue;
      }
      validateDialogueValue(
        value,
        `${actionPath}.${variantName}`,
        availableActions,
        errors,
        warnings,
        statistics
      );
    }
  }

  return { errors, warnings, statistics };
}

