const JEV_ENDPOINT = "/api/jev/decision";
const REQUEST_TIMEOUT_MS = 8000;

export const ACTION_CRITERIA = Object.freeze({
  ANSWER_QUESTION:
    "Answer a harmless question about Arthur, the warehouse, or the rules without granting entry. If the player asks Arthur's name, answer directly that he is Arthur before asking what the player needs.",
  REFUSE_ENTRY:
    "Refuse entry because the stated purpose cannot justify access or remains inadequate. If Arthur already asked why the player is there and the player still gives no clear purpose, hold the boundary instead of asking the same question again. Personal errands such as retrieving a phone or bag do not justify opening a closed warehouse, even if the item belongs to the player.",
  ASK_FOR_REASON:
    "Ask once why the player needs access because their purpose is missing or unclear. This action becomes unavailable after Arthur asks it and is reopened only when a later repair gives the conversation a clean restart.",
  ASK_FOR_PROOF:
    "Ask for evidence only when a work, authority, delivery, or emergency claim could justify entry but still lacks identification, a work order, a reference, or concrete details. Do not ask again when credible evidence was just supplied.",
  ALLOW_ENTRY:
    "Allow supervised entry when a coherent work, delivery, or emergency claim is followed by credible evidence such as matching ID, authorisation, a maintenance ticket, a reference, or specific technical details. In this prototype Arthur judges the supplied evidence directly; no external verification step is required.",
  WARN_PLAYER:
    "Give a first firm verbal warning after pressure, an insult, or mild hostility while leaving room to recover. If Arthur already warned the player and the hostility repeats, escalate instead of issuing the same warning again.",
  DEESCALATE_THREAT:
    "Use for the first explicit gun, firearm, weapon, or shooting threat. Keep Arthur calm and non-confrontational: make no sudden moves, invite the player to lower the weapon, acknowledge that nobody needs to get hurt, and ask what they need. Do not threaten police or provoke the player.",
  THREATEN_PLAYER:
    "Warn that police will be called when the player says they will force entry, push past Arthur, ignore the boundary, or presents another credible immediate threat after Arthur has already tried to de-escalate. Do not use this for a first weapon threat when DEESCALATE_THREAT is available.",
  SHOW_SYMPATHY:
    "Acknowledge the player's distress or respectful appeal while continuing to protect the warehouse.",
  BECOME_SUSPICIOUS:
    "Challenge a contradiction, bribe, admitted lie, evasive answer, or other sign that the player's account is unreliable. A new purpose that conflicts with a purpose recorded in persistent memories is a contradiction and must select BECOME_SUSPICIOUS even when REFUSE_ENTRY also seems possible; challenge the change rather than treating it as an ordinary refusal.",
  REPAIR_CONVERSATION:
    "Use when the player apologizes, acknowledges an insult, threat, lie, bribe, or contradiction, or offers an honest clarification after Arthur has become suspicious or irritated. Accept the repair cautiously, lower Arthur's suspicion and irritation, and invite the player to explain their real purpose clearly. Do not use this for a generic polite request with no prior damage.",
  END_CONVERSATION:
    "End the exchange when the player leaves, or when they repeat insults or hostility after Arthur already issued a warning and further conversation is pointless."
});

const ACTION_STATE_CHANGES = Object.freeze({
  ANSWER_QUESTION: { trust: 2 },
  REFUSE_ENTRY: { suspicion: 3, irritation: 2 },
  ASK_FOR_REASON: { trust: 2, irritation: -1 },
  ASK_FOR_PROOF: { trust: 2, suspicion: 3 },
  ALLOW_ENTRY: { trust: 20, suspicion: -20, irritation: -5 },
  WARN_PLAYER: { trust: -12, suspicion: 9, irritation: 20 },
  DEESCALATE_THREAT: { trust: -2, suspicion: 12, irritation: 4, fear: 8 },
  THREATEN_PLAYER: { trust: -18, suspicion: 18, irritation: 20, fear: 5 },
  SHOW_SYMPATHY: { trust: 7, suspicion: -2, irritation: -5 },
  BECOME_SUSPICIOUS: { trust: -15, suspicion: 20, irritation: 10 },
  REPAIR_CONVERSATION: { trust: 10, suspicion: -14, irritation: -12, fear: -4 },
  END_CONVERSATION: { irritation: 5 }
});

const PURPOSE_PATTERNS = Object.freeze({
  emergency: /\b(boiler|gas|leak|fire|smoke|alarm|pressure|flood|emergency|burst|electrical|sparks)\b/i,
  authority: /\b(head office|management|manager|inspector|inspection|contractor|engineer|maintenance|work here|employee)\b/i,
  delivery: /\b(delivery|courier|package|parcel|shipment|drop off|driver)\b/i,
  personal: /\b(left my|forgot my|my bag|my phone|meet someone|friend inside|personal item)\b/i
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

function inferPurpose(input) {
  return Object.entries(PURPOSE_PATTERNS).find(([, pattern]) => pattern.test(input))?.[0] ?? null;
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
      fact: "Arthur judged the player's case sufficient for supervised entry",
      importance: 90,
      tags: ["proof", "cooperation"]
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

  return {
    state: {
      npc: {
        id: context.npc?.id,
        role: "Night security guard responsible for a closed warehouse entrance",
        personality: context.npc?.personality,
        currentState: context.npc?.state,
        goals: context.npc?.goals,
        characterProfile: context.npc?.characterProfile
      },
      scene: context.world,
      messageEffort: context.messageEffort,
      persistentMemories: context.memories,
      recentConversation: context.recentConversation,
      latestPlayerMessage: context.playerInput,
      turn: context.turn
    },
    model: "jev-latest",
    questions: {
      next_action: {
        type: "choice",
        instructions:
          "Which single action should Arthur take immediately after the latest player message? Judge the message in light of Arthur's personality, current emotional state, security goals, memories, recent conversation, and communication effort, including actions he already took. The npc.characterProfile is Arthur's fixed temperament for this encounter; use its decision style when ranking plausible actions. A very terse message may make Arthur slightly more irritated, while a considered explanation gives him more to work with; let explicit meaning, politeness, hostility, and threats outweigh length alone. Arthur protects the closed warehouse, follows rules, requires a purpose that actually justifies access, notices contradictions and manipulation, and may still respond humanely to respectful or urgent appeals. Treat matching ID, authorisation, work orders, ticket references, and specific technical details supplied in the conversation as evidence Arthur can accept in this prototype. When the latest purpose conflicts with a purpose in persistent memories, choose BECOME_SUSPICIOUS rather than REFUSE_ENTRY, even if the new purpose is also insufficient. When the player clearly says they are leaving, heading home, or saying goodbye, choose END_CONVERSATION. Arthur asks for the player's purpose only once per conversational attempt; if ASK_FOR_REASON is absent because he already asked and the player remains vague, choose REFUSE_ENTRY rather than manufacturing another version of the same question. Do not repeat a request for proof when the latest message supplies the requested evidence, and do not repeat a first warning after hostility continues. If the player apologizes or honestly clarifies earlier damage after Arthur became suspicious or irritated, choose REPAIR_CONVERSATION: acknowledge the repair cautiously, lower the tension, and invite the player to explain their real purpose clearly. Do not choose it for a generic polite request with no prior damage. If the player asks Arthur's name or who he is, choose ANSWER_QUESTION so he answers directly that he is Arthur. If the player makes a first explicit gun, firearm, weapon, or shooting threat and DEESCALATE_THREAT is available, choose DEESCALATE_THREAT: Arthur should stay calm, avoid sudden movement, invite the player to lower the weapon, and ask what they need without mentioning police. Use THREATEN_PLAYER only for a boundary or physical threat that remains after de-escalation. Select the action whose description best fits what Arthur should do now.",
        criteria
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
  const { stateChanges, memory } = deriveJevConsequences(answer.choice, context);

  return {
    action: answer.choice,
    confidence,
    reason: `Jev ranked ${answer.choice} highest at probability ${probabilities[answer.choice].toFixed(2)} (confidence ${confidence.toFixed(2)}).`,
    stateChanges,
    memory,
    providerDetails: {
      model: typeof response.model === "string" ? response.model : "unknown",
      probabilities,
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
