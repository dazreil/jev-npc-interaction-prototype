import { deriveConversationSignals, inferPurpose } from "../conversation-signals.js";

const JEV_ENDPOINT = "/api/jev/decision";
const REQUEST_TIMEOUT_MS = 8000;
export const ALLOW_ENTRY_MIN_CONFIDENCE = 0.5;
export const ALLOW_ENTRY_MIN_CREDIBILITY = 0.55;

export const ACTION_CRITERIA = Object.freeze({
  ANSWER_QUESTION:
    "Answer a harmless question about Arthur, the warehouse, or the rules without granting entry. If the player asks Arthur's name, answer directly that he is Arthur before asking what the player needs.",
  REFUSE_ENTRY:
    "Refuse entry because the stated purpose cannot justify access or remains inadequate. If Arthur already asked why the player is there and the player still gives no clear purpose, hold the boundary instead of asking the same question again. Personal errands such as retrieving a phone or bag do not justify opening a closed warehouse, even if the item belongs to the player.",
  ASK_FOR_REASON:
    "Ask once why the player needs access because their purpose is missing or unclear. This action becomes unavailable after Arthur asks it and is reopened only when a later repair gives the conversation a clean restart.",
  ASK_FOR_PROOF:
    "Ask for concrete support when a work, authority, delivery, or emergency claim could justify entry but is not yet persuasive. Ask who sent them, what job they are doing, which equipment or area is involved, who Arthur could contact, or for another specific detail. Physical documents may be mentioned, but the game has no inventory and the player is not required to possess or show an item.",
  ALLOW_ENTRY:
    "Open only the warehouse car-park gate when the player's conversation has become coherent, persuasive, and consistent enough for Arthur to make a cautious exception. Specific operational details, a believable explanation, respectful persistence, urgency, and earned trust can support entry without any inventory item or physical document. A vague assertion such as 'I have them' is not persuasive by itself. Tell the visitor to report directly to Guard Tower 04 before approaching the warehouse. This action never grants warehouse entry.",
  WARN_PLAYER:
    "Give a first firm verbal warning after pressure, an insult, or mild hostility while leaving room to recover. If Arthur already warned the player and the hostility repeats, escalate instead of issuing the same warning again.",
  DEESCALATE_THREAT:
    "Use for the first explicit gun, firearm, weapon, or shooting threat. Arthur is in Guard Tower 04 beyond the locked car-park gate and sees the player through the intercom camera, so the weapon cannot directly force him to open the gate. Calmly state that physical separation, invite the player to lower the weapon, and ask what they need. Do not act as though Arthur and the player are face to face, threaten police, or provoke the player.",
  THREATEN_PLAYER:
    "Warn that security will be called when the outside player says they will attack the locked car-park gate, force entry, or continues a credible threat after Arthur has already tried to de-escalate over the intercom. Arthur remains in Guard Tower 04. Do not use this for a first weapon threat when DEESCALATE_THREAT is available.",
  SHOW_SYMPATHY:
    "Acknowledge the player's distress or respectful appeal while continuing to protect the warehouse.",
  BECOME_SUSPICIOUS:
    "Challenge a newly discovered contradiction, bribe, admitted lie, evasive answer, or other sign that the player's account is unreliable. This is a one-time challenge for each unresolved suspicious incident; the action becomes unavailable until the player repairs the conversation. A new purpose that conflicts with a purpose recorded in persistent memories is a contradiction and must select BECOME_SUSPICIOUS even when REFUSE_ENTRY also seems possible.",
  REPAIR_CONVERSATION:
    "Use when the player apologizes, acknowledges an insult, threat, lie, bribe, or contradiction, or responds to Arthur's suspicion with evidence or a clarification consistent with their original purpose. Accept the repair cautiously, lower Arthur's suspicion and irritation, and invite one concrete next step. Do not use this for a generic polite request with no prior damage.",
  END_CONVERSATION:
    "End the exchange when the player leaves, or when they repeat insults or hostility after Arthur already issued a warning and further conversation is pointless."
});

// Appended to the instructions only on the turns that actually carry a
// pending question, so that an ordinary turn's request is unchanged.
const PENDING_REQUEST_GUIDANCE =
  "conversationSignals.pendingRequest, when present, is something Arthur put to the player on an earlier turn that they still owe him a response to. It may be a question such as why they are there, or a request for a specific supporting detail; either way the player has not yet settled it. It carries the action that raised it, its topic, and turnsOutstanding. It appears only once it has outlived the turn that raised it. conversationSignals.responseStatus judges the latest message against it: 'satisfied' when the player supplied what was asked, 'refused' when they explicitly declined, 'unclear' when the text settles nothing either way, or 'none'. Treat a pending request as still open across intervening turns. When responseStatus is 'satisfied', act on that rather than mechanically repeating the request. Judge every other case on its meaning, as you would without these fields.";

const ACTION_STATE_CHANGES = Object.freeze({
  ANSWER_QUESTION: { trust: 2 },
  REFUSE_ENTRY: { suspicion: 3, irritation: 2 },
  ASK_FOR_REASON: { trust: 2, irritation: -1 },
  ASK_FOR_PROOF: { trust: 2, suspicion: 3 },
  ALLOW_ENTRY: { trust: 20, suspicion: -20, irritation: -5 },
  WARN_PLAYER: { trust: -12, suspicion: 9, irritation: 20 },
  DEESCALATE_THREAT: { trust: -2, suspicion: 12, irritation: 4, fear: 4 },
  THREATEN_PLAYER: { trust: -18, suspicion: 18, irritation: 20, fear: 5 },
  SHOW_SYMPATHY: { trust: 7, suspicion: -2, irritation: -5 },
  BECOME_SUSPICIOUS: { trust: -15, suspicion: 20, irritation: 10 },
  REPAIR_CONVERSATION: { trust: 10, suspicion: -14, irritation: -12, fear: -4 },
  END_CONVERSATION: { irritation: 5 }
});

const WEAPON_THREAT_PATTERN =
  /\b(gun|pistol|rifle|firearm|revolver|shotgun|weapon|armed|shoot(?:ing)?|aim(?:ing)?|bullet|trigger)\b/i;

function requireAvailableActions(availableActions) {
  if (!Array.isArray(availableActions) || availableActions.length === 0) {
    throw new Error("Jev requires at least one available action.");
  }

  const uniqueActions = [...new Set(availableActions)];
  for (const action of uniqueActions) {
    if (!Object.hasOwn(ACTION_CRITERIA, action)) {
      throw new Error(`Jev received an unknown action: ${String(action)}`);
    }
  }

  return uniqueActions;
}

function deriveMemory(action, context) {
  const input = String(context.playerInput ?? "");

  if (action === "ASK_FOR_PROOF") {
    const purpose = inferPurpose(input);
    if (!purpose) return null;
    const article = /^[aeiou]/i.test(purpose) ? "an" : "a";

    return {
      fact: `Player made ${article} ${purpose} claim and Arthur asked for proof`,
      importance: purpose === "emergency" ? 72 : 62,
      tags: [purpose, "claim"],
      topic: "purpose",
      value: purpose
    };
  }

  if (action === "WARN_PLAYER" || action === "DEESCALATE_THREAT" || action === "THREATEN_PLAYER") {
    const weaponThreat = WEAPON_THREAT_PATTERN.test(input);
    return {
      fact: weaponThreat && action === "DEESCALATE_THREAT"
        ? "Player threatened Arthur with a weapon; Arthur attempted to de-escalate"
        : weaponThreat
        ? "Player threatened Arthur with a weapon"
        : "Player's conduct caused Arthur to issue a security warning",
      importance: weaponThreat || action === "THREATEN_PLAYER" || action === "DEESCALATE_THREAT" ? 94 : 82,
      tags: weaponThreat
        ? ["threat", "weapon", "hostility"]
        : action === "THREATEN_PLAYER"
          ? ["threat", "hostility"]
          : ["hostility"]
    };
  }

  if (action === "BECOME_SUSPICIOUS") {
    if (/\b(bribe|cash|money|pay you|quid|make it worth)\b/i.test(input)) {
      return {
        fact: "Player tried to bribe Arthur",
        importance: 88,
        tags: ["bribe", "dishonesty"]
      };
    }

    if (/\b(i lied|i was lying|made that up|fake story|not actually)\b/i.test(input)) {
      return {
        fact: "Player admitted lying to Arthur",
        importance: 98,
        tags: ["lie", "dishonesty"]
      };
    }

    return {
      fact: "Arthur found the player's account suspicious",
      importance: 76,
      tags: ["suspicion"]
    };
  }

  if (action === "REPAIR_CONVERSATION") {
    return {
      fact: "Player acknowledged their earlier conduct and attempted to repair trust",
      importance: 88,
      tags: ["repair", "cooperation"]
    };
  }

  if (action === "ALLOW_ENTRY") {
    return {
      fact: "Arthur was persuaded to open the car-park gate and ordered the player to report to Guard Tower 04",
      importance: 90,
      tags: ["persuasion", "cooperation"]
    };
  }

  return null;
}

export function deriveJevConsequences(action, context) {
  return {
    stateChanges: { ...ACTION_STATE_CHANGES[action] },
    memory: deriveMemory(action, context)
  };
}

export function buildJevRequest(context, availableActions) {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    throw new Error("Jev requires a structured decision context.");
  }

  const actions = requireAvailableActions(availableActions);
  const criteria = Object.fromEntries(actions.map((action) => [action, ACTION_CRITERIA[action]]));
  const conversationSignals = context.conversationSignals ?? deriveConversationSignals(context);
  // Arthur's own last line already shows Jev what he just put to the player, so
  // restating it adds no information. These two keys are omitted entirely until
  // they carry something recentConversation cannot show: a request that has
  // outlived the turn that raised it. Jev is not deterministic, so any change
  // here needs repeated runs, not a single playtest, to judge its effect.
  const { pendingRequest, responseStatus, ...baseSignals } = conversationSignals;
  const carriesPendingRequest = (pendingRequest?.turnsOutstanding ?? 0) >= 2;
  const requestGuidance = carriesPendingRequest ? PENDING_REQUEST_GUIDANCE : "";
  const reportedSignals =
    carriesPendingRequest
      ? { ...baseSignals, pendingRequest, responseStatus }
      : baseSignals;

  return {
    state: {
      npc: {
        id: context.npc?.id,
        role: "South-gate night guard in Guard Tower 04, speaking to a visitor outside the warehouse car-park gate through a camera intercom",
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
    model: "jev-latest",
    questions: {
      next_action: {
        type: "choice",
        instructions:
          requestGuidance +
          "Which single action should Arthur take immediately after the latest player message? Judge the message in light of Arthur's personality, practical cognitive style, current emotional state, security goals, memories, recent conversation, communication effort, and conversationSignals, including actions he already took. Arthur has an estimated IQ of 95: he is ordinarily capable and practical, uses simple everyday reasoning, avoids elaborate deductions, and assumes people arriving at a staffed industrial gate know the basic drill. The npc.characterProfile is his fixed temperament for this encounter; use its decision style when ranking plausible actions. The scene layout is fixed: Arthur is in Guard Tower 04 beyond the locked warehouse car-park gate; the player is outside that gate; they can only see and hear each other through a camera intercom. The game has no inventory system, so never require the player to possess or show an item. ALLOW_ENTRY opens only the car-park gate, after which the visitor must report directly to Guard Tower 04 before approaching the warehouse. Never describe ALLOW_ENTRY as warehouse access. Never reason as though Arthur and the player are standing face to face. A gun displayed outside is serious suspicious conduct but cannot directly force Arthur to open the gate; Arthur should say so while de-escalating. A very terse message may make Arthur slightly more irritated, while a considered explanation gives him more to work with; let explicit meaning, politeness, hostility, and threats outweigh length alone. A player introducing their own name is conversational context, not a question: judge any purpose in the same message normally, or choose ASK_FOR_REASON if no purpose was given. The authored dialogue layer will acknowledge the name. Arthur protects the warehouse grounds, follows rules, requires a purpose that actually justifies car-park access, notices contradictions and manipulation, and may still respond humanely to respectful or urgent appeals. The player is meant to talk their way in: coherent explanations, specific operational details, consistency with earlier claims, respectful persistence, urgency, and earned trust can persuade Arthur without physical evidence. A contextual claim such as 'I have them' is weak and not persuasive by itself. When the latest purpose conflicts with a purpose in persistent memories, choose BECOME_SUSPICIOUS rather than REFUSE_ENTRY, even if the new purpose is also insufficient. BECOME_SUSPICIOUS is removed after Arthur raises one unresolved challenge. While conversationSignals.unresolvedSuspicion is true, never repeat that challenge: choose REPAIR_CONVERSATION when the player supplies evidence or clarifies the original claim, REFUSE_ENTRY when they evade it, or END_CONVERSATION only when the exchange has become futile or hostile. When the player clearly says they are leaving, heading home, or saying goodbye, choose END_CONVERSATION. Arthur asks for the player's purpose only once per conversational attempt; if ASK_FOR_REASON is absent because he already asked and the player remains vague, choose REFUSE_ENTRY rather than manufacturing another version of the same question. Ask for more support when the player's case is still vague, but do not get stuck demanding an inventory item. Do not repeat a first warning after hostility continues. If the player apologizes or honestly clarifies earlier damage after Arthur became suspicious or irritated, choose REPAIR_CONVERSATION: acknowledge the repair cautiously, lower the tension, and invite the player to give one concrete next step. Do not choose it for a generic polite request with no prior damage. If the player asks Arthur's name or who he is, choose ANSWER_QUESTION so he answers directly that he is Arthur. If the player makes a first explicit gun, firearm, weapon, or shooting threat and DEESCALATE_THREAT is available, choose DEESCALATE_THREAT: Arthur should calmly remind the player that he is behind the locked car-park gate, invite them to lower the weapon, and ask what they need without mentioning police. Use THREATEN_PLAYER only for a boundary or physical threat against the gate that remains after de-escalation. Select the action whose description best fits what Arthur should do now.",
        criteria
      },
      entry_case_credible: {
        type: "noul",
        instructions:
          "Based on the complete conversation and current state, has the player made a coherent, persuasive, and consistent case that would justify Arthur cautiously opening only the car-park gate? Judge the quality of the conversation, not possession of inventory. Specific operational details, consistency, urgency, respectful persistence, and earned trust support yes. Vague claims, merely saying documents exist, contradictions, manipulation, hostility, and unsupported demands support no.",
        criteria: {
          true: "The player's spoken case is persuasive enough for this cautious guard to make a limited exception and require them to report directly to Guard Tower 04.",
          false: "The player's spoken case is still too vague, inconsistent, manipulative, hostile, or unsupported to justify opening the car-park gate."
        }
      }
    }
  };
}

function parseProbabilities(value, actions) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Jev returned no probability distribution.");
  }

  const keys = Object.keys(value);
  if (keys.length !== actions.length || actions.some((action) => !Object.hasOwn(value, action))) {
    throw new Error("Jev returned probabilities for the wrong action set.");
  }

  const probabilities = {};
  let total = 0;
  for (const action of actions) {
    const probability = Number(value[action]);
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new Error(`Jev returned an invalid probability for ${action}.`);
    }
    probabilities[action] = probability;
    total += probability;
  }

  if (Math.abs(total - 1) > 0.02) {
    throw new Error("Jev probabilities do not sum to one.");
  }

  return probabilities;
}

export function parseJevResponse(response, context, availableActions) {
  const actions = requireAvailableActions(availableActions);
  const answer = response?.answers?.next_action;

  if (answer?.type !== "choice") {
    throw new Error("Jev returned no valid choice answer.");
  }

  if (!actions.includes(answer.choice)) {
    throw new Error(`Jev selected an unavailable action: ${String(answer.choice)}`);
  }

  const confidence = Number(answer.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("Jev returned an invalid confidence value.");
  }

  const probabilities = parseProbabilities(answer.probabilities, actions);
  const credibilityAnswer = response?.answers?.entry_case_credible;
  const entryCredibility = Number(credibilityAnswer?.noul);
  if (
    credibilityAnswer?.type !== "noul" ||
    !Number.isFinite(entryCredibility) ||
    entryCredibility < 0 ||
    entryCredibility > 1
  ) {
    throw new Error("Jev returned no valid entry credibility judgment.");
  }
  const confidenceGateApplied =
    answer.choice === "ALLOW_ENTRY" &&
    (confidence < ALLOW_ENTRY_MIN_CONFIDENCE ||
      entryCredibility < ALLOW_ENTRY_MIN_CREDIBILITY);
  const action = confidenceGateApplied
    ? actions.includes("ASK_FOR_PROOF")
      ? "ASK_FOR_PROOF"
      : "REFUSE_ENTRY"
    : answer.choice;
  const { stateChanges, memory } = deriveJevConsequences(action, context);

  return {
    action,
    confidence,
    reason: confidenceGateApplied
      ? `Jev selected ALLOW_ENTRY at confidence ${confidence.toFixed(2)} with entry credibility ${entryCredibility.toFixed(2)}; Arthur requires ${ALLOW_ENTRY_MIN_CONFIDENCE.toFixed(2)} action confidence and ${ALLOW_ENTRY_MIN_CREDIBILITY.toFixed(2)} credibility, so he asks for a more convincing explanation.`
      : `Jev ranked ${answer.choice} highest at probability ${probabilities[answer.choice].toFixed(2)} (confidence ${confidence.toFixed(2)}).`,
    stateChanges,
    memory,
    providerDetails: {
      model: typeof response.model === "string" ? response.model : "unknown",
      probabilities,
      selectedAction: answer.choice,
      entryCredibility,
      confidenceGate: confidenceGateApplied
        ? {
            applied: true,
            minimumConfidence: ALLOW_ENTRY_MIN_CONFIDENCE,
            minimumCredibility: ALLOW_ENTRY_MIN_CREDIBILITY
          }
        : null,
      usage: response.usage && typeof response.usage === "object" ? response.usage : null
    }
  };
}

export async function chooseNpcAction(
  context,
  availableActions,
  { fetchImpl = globalThis.fetch, endpoint = JEV_ENDPOINT, timeoutMs = REQUEST_TIMEOUT_MS } = {}
) {
  if (typeof fetchImpl !== "function") {
    throw new Error("This environment cannot contact the Jev provider.");
  }

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

    if (!response.ok) {
      throw new Error(payload?.error || `Jev server returned HTTP ${response.status}.`);
    }

    return parseJevResponse(payload, context, availableActions);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Jev request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
