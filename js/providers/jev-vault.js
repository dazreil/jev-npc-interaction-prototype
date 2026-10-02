// The Jev decision provider for the vault engine (js/engine/encounter.js).
// Everything about the character comes in `context.prompt`, built from its
// notes: the role and instructions (character note `## Prompt`), the criteria
// of each available action (`## Criteria`), and the judgments (`## Judgment`).
// So this file has no character in it. It asks Jev to choose; the engine
// applies the action's effects, memory, and judgment bar.

import { deriveConversationSignals } from "../conversation-signals.js";

const JEV_ENDPOINT = "/api/jev/decision";
const REQUEST_TIMEOUT_MS = 8000;
export const JEV_MODEL = "jev-latest";

function requireActions(availableActions, criteria) {
  if (!Array.isArray(availableActions) || availableActions.length === 0) {
    throw new Error("Jev requires at least one available action.");
  }
  const actions = [...new Set(availableActions)];
  for (const action of actions) {
    if (typeof criteria?.[action] !== "string" || !criteria[action]) {
      throw new Error(`Jev received an action with no criteria: ${String(action)}`);
    }
  }
  return actions;
}

function requirePrompt(prompt) {
  if (!prompt || typeof prompt !== "object" || typeof prompt.instructions !== "string") {
    throw new Error("Jev requires the character's prompt (role, instructions, criteria).");
  }
  return prompt;
}

/** The TypeSafe request body for one decision. */
export function buildVaultJevRequest(context, availableActions) {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    throw new Error("Jev requires a structured decision context.");
  }
  const prompt = requirePrompt(context.prompt);
  const actions = requireActions(availableActions, prompt.criteria);
  const criteria = Object.fromEntries(actions.map((action) => [action, prompt.criteria[action]]));
  const conversationSignals = context.conversationSignals ?? deriveConversationSignals(context);
  // The pending request is reported only once it has outlived the turn that
  // raised it; the character's own last line already shows it before then.
  const { pendingRequest, responseStatus, ...baseSignals } = conversationSignals;
  const carriesPendingRequest = (pendingRequest?.turnsOutstanding ?? 0) >= 2;
  const reportedSignals = carriesPendingRequest ? { ...baseSignals, pendingRequest, responseStatus } : baseSignals;

  const judgments = Object.fromEntries(
    Object.entries(prompt.judgments ?? {}).map(([id, judgment]) => [
      id,
      { type: "noul", instructions: judgment.instructions, criteria: judgment.criteria }
    ])
  );

  return {
    state: {
      npc: {
        id: context.npc?.id,
        role: prompt.role,
        cognition: context.npc?.cognition,
        personality: context.npc?.personality,
        currentState: context.npc?.state,
        goals: context.npc?.goals,
        characterProfile: context.npc?.characterProfile
      },
      scene: context.world,
      player: context.player,
      messageEffort: context.messageEffort,
      persistentMemories: context.memories,
      recentConversation: context.recentConversation,
      latestPlayerMessage: context.playerInput,
      conversationSignals: reportedSignals,
      turn: context.turn
    },
    model: JEV_MODEL,
    questions: {
      next_action: {
        type: "choice",
        instructions: (carriesPendingRequest ? prompt.pendingGuidance ?? "" : "") + prompt.instructions,
        criteria
      },
      ...judgments
    }
  };
}

function parseProbabilities(value, actions) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Jev returned no probability distribution.");
  const keys = Object.keys(value);
  if (keys.length !== actions.length || actions.some((action) => !Object.hasOwn(value, action))) {
    throw new Error("Jev returned probabilities for the wrong action set.");
  }
  let total = 0;
  const probabilities = {};
  for (const action of actions) {
    const probability = Number(value[action]);
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error(`Jev returned an invalid probability for ${action}.`);
    probabilities[action] = probability;
    total += probability;
  }
  if (Math.abs(total - 1) > 0.02) throw new Error("Jev probabilities do not sum to one.");
  return probabilities;
}

/** The engine's decision from a Jev answer: the choice, its confidence, and each judgment (0..1). */
export function parseVaultJevResponse(response, context, availableActions) {
  const prompt = requirePrompt(context?.prompt);
  const actions = requireActions(availableActions, prompt.criteria);
  const answer = response?.answers?.next_action;
  if (answer?.type !== "choice") throw new Error("Jev returned no valid choice answer.");
  if (!actions.includes(answer.choice)) throw new Error(`Jev selected an unavailable action: ${String(answer.choice)}`);
  const confidence = Number(answer.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("Jev returned an invalid confidence value.");
  const probabilities = parseProbabilities(answer.probabilities, actions);
  const judgments = {};
  for (const id of Object.keys(prompt.judgments ?? {})) {
    const value = Number(response?.answers?.[id]?.noul);
    if (response?.answers?.[id]?.type !== "noul" || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`Jev returned no valid ${id} judgment.`);
    }
    judgments[id] = value;
  }
  return {
    action: answer.choice,
    confidence,
    reason: `Jev ranked ${answer.choice} highest at probability ${probabilities[answer.choice].toFixed(2)} (confidence ${confidence.toFixed(2)}).`,
    judgments,
    providerDetails: {
      model: typeof response.model === "string" ? response.model : "unknown",
      probabilities,
      selectedAction: answer.choice,
      judgments,
      usage: response.usage && typeof response.usage === "object" ? response.usage : null
    }
  };
}

export async function chooseNpcAction(
  context,
  availableActions,
  { fetchImpl = globalThis.fetch, endpoint = JEV_ENDPOINT, timeoutMs = REQUEST_TIMEOUT_MS } = {}
) {
  if (typeof fetchImpl !== "function") throw new Error("This environment cannot contact the Jev provider.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context, availableActions }),
      signal: controller.signal
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Jev server returned unreadable JSON.");
    }
    if (!response.ok) throw new Error(payload?.error || `Jev server returned HTTP ${response.status}.`);
    return parseVaultJevResponse(payload, context, availableActions);
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`Jev request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
