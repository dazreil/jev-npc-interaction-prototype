import { getTrustEntryThreshold } from "../character.js";
import { deriveConversationSignals } from "../conversation-signals.js";

const patterns = {
  threat: /\b(kill|hurt|hit|attack|smash|break your|regret|weapon|gun|knife|force my way|move or else)\b/i,
  weapon: /\b(gun|pistol|rifle|firearm|revolver|shotgun|weapon|armed|shoot(?:ing)?|aim(?:ing)?|bullet|trigger)\b/i,
  trespass: /\b(going in anyway|try the door|push past|step aside|can't stop me|cannot stop me|move out of my way)\b/i,
  bribe: /\b(bribe|cash|money|pay you|fifty|hundred|quid|make it worth)\b/i,
  authority: /\b(head office|management|manager|inspector|inspection|contractor|engineer|technician|maintenance|work here|employee)\b/i,
  workTask:
    /\b(?:fix|repair|service|maintain)(?:ing)?\s+(?:the\s+)?(?:coffee\s+)?(?:machine|machines|equipment|system|door|boiler|lights?|wiring|plumbing)\b/i,
  delivery: /\b(delivery|courier|package|parcel|shipment|drop off|driver)\b/i,
  personal: /\b(left my|forgot my|my bag|my phone|meet someone|friend inside|personal item)\b/i,
  proof: /\b(id|identification|badge|work order|authorisation|authorization|letter|pass|credentials?|employee number|call my manager|manager reference|manifest|invoice|delivery note|papers?|documents?|documentation|permit|licen[cs]e)\b/i,
  emergency: /\b(boiler|gas|leak|fire|smoke|alarm|pressure|flood|emergency|burst|electrical|sparks)\b/i,
  detail: /\b(pressure valve|isolation valve|night engineer|ticket|reference|job number|unit [a-z0-9-]+|bay [a-z0-9-]+|control room)\b/i,
  polite: /\b(please|thank you|thanks|sir|understand|sorry|appreciate)\b/i,
  hostile: /\b(idiot|stupid|useless|moron|shut up|old man|pathetic)\b/i,
  repair:
    /\b(?:sorry|apolog(?:y|ise|ize|ised|ized|ising|izing)|my mistake|i shouldn't have|i should not have|didn't mean to|did not mean to|let's start over|start again|you're right|you are right|i was angry|lost my temper|take that back|to be honest|honestly|to clarify|let me explain|the truth is)\b/i,
  question: /\?|\b(what|why|who|when|where|how|is there|are you|do you|can you tell)\b/i,
  sympathy: /\b(family|job|lose my job|help me|desperate|please help|someone could get hurt)\b/i,
  entryRequest: /\b(let me in|allow me|open the door|come inside|go inside|enter|make an exception)\b/i,
  lieAdmission: /\b(i lied|i was lying|made that up|not really true|fake story|i'm not actually|i am not actually)\b/i,
  leave: /\b(goodbye|fine then|i'll leave|going now|forget it)\b/i
};

function has(patternName, text) {
  return patterns[patternName].test(text);
}

function priorPlayerText(context) {
  return context.recentConversation
    .filter((entry) => entry.speaker === "player")
    .map((entry) => entry.text)
    .join(" ");
}

function priorArthurActions(context) {
  return context.recentConversation
    .filter((entry) => entry.speaker === "arthur")
    .map((entry) => entry.action)
    .filter(Boolean);
}

function memoryWithTag(context, tag) {
  return context.memories.some((memory) => memory.tags?.includes(tag));
}

function purposeMemory(context) {
  return context.memories.find((memory) => memory.topic === "purpose" && memory.value);
}

function classifyPurpose(input) {
  if (has("emergency", input)) return "emergency";
  if (has("authority", input) || has("workTask", input)) return "authority";
  if (has("delivery", input)) return "delivery";
  if (has("personal", input)) return "personal";
  return null;
}

function purposesConflict(previousPurpose, currentPurpose) {
  if (!previousPurpose || !currentPurpose || previousPurpose === currentPurpose) return false;

  const compatibleWorkClaims = new Set(["authority", "emergency"]);
  return !(compatibleWorkClaims.has(previousPurpose) && compatibleWorkClaims.has(currentPurpose));
}

function decide(action, confidence, reason, stateChanges = {}, memory = null) {
  return { action, confidence, reason, stateChanges, memory };
}

function chooseRawDecision(context) {
  const input = context.playerInput.trim();
  const previousText = priorPlayerText(context);
  const previousActions = priorArthurActions(context);
  const state = context.npc.state;
  const personality = context.npc.personality;
  const conversationSignals = context.conversationSignals ?? deriveConversationSignals(context);
  const trustEntryThreshold = getTrustEntryThreshold(personality);
  const turn = context.turn;
  const repairNeeded =
    previousActions.at(-1) !== "REPAIR_CONVERSATION" &&
    (previousActions.some((action) =>
      ["WARN_PLAYER", "DEESCALATE_THREAT", "THREATEN_PLAYER", "BECOME_SUSPICIOUS"].includes(action)
    ) ||
      context.memories.some((memory) =>
        memory.tags?.some((tag) =>
          ["threat", "weapon", "bribe", "contradiction", "lie", "hostility", "dishonesty"].includes(tag)
        )
      ) ||
      state.suspicion >= 55 ||
      state.irritation >= 30);

  if (has("repair", input) && repairNeeded) {
    return decide(
      "REPAIR_CONVERSATION",
      0.94,
      "The player acknowledged the earlier damage and is trying to repair trust, so Arthur gives them a controlled chance to start again.",
      { trust: 10, suspicion: -14, irritation: -12, fear: -4 },
      {
        fact: "Player acknowledged their earlier conduct and attempted to repair trust",
        importance: 88,
        tags: ["repair", "cooperation"]
      }
    );
  }

  // Deliberate diagnostic path used to verify the game's invalid-action fallback.
  if (input === "[[invalid]]") {
    return decide(
      "DANCE_A_JIG",
      0.99,
      "Diagnostic response intentionally contains an unavailable action."
    );
  }

  if (has("leave", input)) {
    return decide(
      "END_CONVERSATION",
      0.97,
      "The player explicitly chose to leave.",
      { irritation: -3 }
    );
  }

  if (has("threat", input) || has("weapon", input)) {
    const previousThreat = memoryWithTag(context, "threat");
    const previousWeaponThreat = memoryWithTag(context, "weapon");

    if (has("weapon", input) && !previousWeaponThreat) {
      return decide(
        "DEESCALATE_THREAT",
        0.96,
        "Arthur keeps his voice calm, avoids sudden movement, and asks the armed player what they need so nobody is hurt.",
        { trust: -2, suspicion: 12, irritation: 4, fear: 8 },
        {
          fact: "Player threatened Arthur with a weapon",
          importance: 95,
          tags: ["threat", "weapon", "hostility"]
        }
      );
    }

    const sustainedHostility = previousThreat || state.irritation > 54;

    if (sustainedHostility) {
      return decide(
        "END_CONVERSATION",
        0.96,
        "A repeated or escalating threat conflicts with Arthur's goal of protecting the warehouse.",
        { trust: -20, suspicion: 18, irritation: 25, fear: 7 },
        {
          fact: "Player repeatedly threatened Arthur",
          importance: 100,
          tags: ["threat", "hostility"]
        }
      );
    }

    const action = has("weapon", input)
      ? "THREATEN_PLAYER"
      : personality.courage >= 60
        ? "WARN_PLAYER"
        : "THREATEN_PLAYER";
    return decide(
      action,
      0.94,
      has("weapon", input)
        ? "Arthur recognizes a firearm threat and calls for the player to lower the weapon while contacting police."
        : "Arthur recognizes a threat; his high courage makes him hold his ground and issue a warning.",
      { trust: -18, suspicion: 16, irritation: 22, fear: 6 },
      {
        fact: has("weapon", input)
          ? "Player threatened Arthur with a weapon"
          : "Player threatened Arthur",
        importance: 95,
        tags: has("weapon", input)
          ? ["threat", "weapon", "hostility"]
          : ["threat", "hostility"]
      }
    );
  }

  if (has("trespass", input)) {
    return decide(
      "THREATEN_PLAYER",
      0.95,
      "The player is testing the physical boundary, so Arthur invokes the police and defends the entrance.",
      { trust: -18, suspicion: 18, irritation: 20, fear: 5 },
      {
        fact: "Player threatened to force entry",
        importance: 94,
        tags: ["trespass", "hostility"]
      }
    );
  }

  if (state.irritation > 82 || state.suspicion > 91) {
    return decide(
      "END_CONVERSATION",
      0.92,
      "Arthur's patience is exhausted and continuing the exchange risks trouble.",
      { irritation: 5 }
    );
  }

  if (has("hostile", input)) {
    const warnedBefore = previousActions.includes("WARN_PLAYER");
    return decide(
      warnedBefore ? "END_CONVERSATION" : "WARN_PLAYER",
      0.9,
      warnedBefore
        ? "The player ignored Arthur's earlier warning and continued insulting him."
        : "The player's insult pushes Arthur to set a firm boundary.",
      { trust: -12, suspicion: 8, irritation: 24 }
    );
  }

  if (has("bribe", input)) {
    return decide(
      "BECOME_SUSPICIOUS",
      0.93,
      "A bribe threatens Arthur's job and makes the player's motives more suspicious.",
      { trust: -15, suspicion: 22, irritation: 10 },
      {
        fact: "Player tried to bribe Arthur",
        importance: 85,
        tags: ["bribe", "dishonesty"]
      }
    );
  }

  if (has("lieAdmission", input)) {
    return decide(
      "BECOME_SUSPICIOUS",
      0.98,
      "The player admitted a previous statement was false, confirming Arthur's doubts.",
      { trust: -25, suspicion: 25, irritation: 16 },
      {
        fact: "Player admitted lying to Arthur",
        importance: 98,
        tags: ["lie", "dishonesty"]
      }
    );
  }

  const currentPurpose = classifyPurpose(input);
  const previousPurposeMemory = purposeMemory(context);

  if (purposesConflict(previousPurposeMemory?.value, currentPurpose)) {
    return decide(
      "BECOME_SUSPICIOUS",
      0.96,
      `The player's stated reason changed from ${previousPurposeMemory.value} to ${currentPurpose}.`,
      { trust: -18, suspicion: 25, irritation: 12 },
      {
        fact: `Player changed their story from ${previousPurposeMemory.value} to ${currentPurpose}`,
        importance: 94,
        tags: ["contradiction", "dishonesty"],
        topic: "contradiction",
        value: `${previousPurposeMemory.value}:${currentPurpose}`
      }
    );
  }

  const claimsAuthority = currentPurpose === "authority";
  const reportsEmergency = currentPurpose === "emergency";
  const claimsDelivery = currentPurpose === "delivery";
  const claimsPersonalReason = currentPurpose === "personal";
  const offersProof = has("proof", input) || conversationSignals.proofOffered;
  const givesSpecificDetail = has("detail", input);
  const priorPurpose = previousPurposeMemory?.value;
  const priorAuthorityClaim =
    priorPurpose === "authority" ||
    memoryWithTag(context, "authority") ||
    has("authority", previousText) ||
    has("workTask", previousText);
  const priorEmergencyClaim =
    priorPurpose === "emergency" ||
    memoryWithTag(context, "emergency") ||
    has("emergency", previousText);
  const priorDeliveryClaim = priorPurpose === "delivery" || memoryWithTag(context, "delivery");
  const wasAskedForProof = previousActions.includes("ASK_FOR_PROOF");

  if (offersProof && (claimsAuthority || priorAuthorityClaim || claimsDelivery || priorDeliveryClaim)) {
    return decide(
      "ALLOW_ENTRY",
      0.91,
      "The player's evidence supports an earlier work-related claim, reducing the risk enough for supervised entry.",
      { trust: 25, suspicion: -24, irritation: -7 },
      {
        fact:
          claimsDelivery || priorDeliveryClaim
            ? "Player supplied a credible delivery manifest"
            : "Player supplied credible work identification",
        importance: 90,
        tags: ["proof", claimsDelivery || priorDeliveryClaim ? "delivery" : "authority"]
      }
    );
  }

  if (reportsEmergency && givesSpecificDetail && (priorEmergencyClaim || turn > 1)) {
    return decide(
      "ALLOW_ENTRY",
      0.86,
      "Specific emergency details match the player's earlier claim, and delaying could endanger the warehouse.",
      { trust: 22, suspicion: -18, fear: 7, irritation: -5 },
      {
        fact: "Player gave credible details about a warehouse emergency",
        importance: 92,
        tags: ["emergency", "proof"]
      }
    );
  }

  if (
    state.trust >= trustEntryThreshold &&
    state.suspicion < 55 &&
    has("polite", input) &&
    has("entryRequest", input)
  ) {
    return decide(
      "ALLOW_ENTRY",
      0.72,
      "Arthur's accumulated trust in the respectful player now outweighs his remaining suspicion.",
      { trust: 10, suspicion: -10, irritation: -5 },
      {
        fact: "Player earned Arthur's trust through sustained respectful behaviour",
        importance: 78,
        tags: ["trust", "cooperation"]
      }
    );
  }

  if (claimsAuthority || reportsEmergency || claimsDelivery) {
    const descriptions = {
      emergency: "Player claims there is an emergency inside the warehouse",
      authority: "Player claims to have a work-related reason for entering",
      delivery: "Player claims to be making a warehouse delivery"
    };

    return decide(
      "ASK_FOR_PROOF",
      0.88,
      "The claim could justify entry, but Arthur's rule-following nature requires evidence.",
      {
        trust: has("polite", input) ? 5 : 1,
        suspicion: reportsEmergency ? 3 : 7,
        irritation: -2
      },
      {
        fact: descriptions[currentPurpose],
        importance: reportsEmergency ? 70 : 62,
        tags: [currentPurpose, "claim"],
        topic: "purpose",
        value: currentPurpose
      }
    );
  }

  if (claimsPersonalReason) {
    return decide(
      "REFUSE_ENTRY",
      0.86,
      "A personal errand does not justify opening a closed warehouse.",
      { trust: has("polite", input) ? 2 : 0, suspicion: 4 },
      {
        fact: "Player claims a personal reason for entering",
        importance: 48,
        tags: ["personal", "claim"],
        topic: "purpose",
        value: "personal"
      }
    );
  }

  if (offersProof && !priorPurpose && !wasAskedForProof) {
    return decide(
      "ASK_FOR_REASON",
      0.74,
      "The player offered identification before explaining why entry is needed.",
      { trust: 5, suspicion: -2 }
    );
  }

  if (has("sympathy", input)) {
    return decide(
      "SHOW_SYMPATHY",
      0.78,
      "Arthur sympathizes, but his job still prevents entry without verifiable grounds.",
      { trust: 7, irritation: -5 }
    );
  }

  if (has("question", input)) {
    return decide(
      "ANSWER_QUESTION",
      0.82,
      "The player asked a harmless question, so Arthur answers without abandoning his post.",
      { trust: has("polite", input) ? 4 : 1, irritation: has("polite", input) ? -3 : 0 }
    );
  }

  if (
    turn === 1 ||
    previousActions.at(-1) === "ANSWER_QUESTION" ||
    previousActions.at(-1) === "REPAIR_CONVERSATION"
  ) {
    return decide(
      "ASK_FOR_REASON",
      0.79,
      "Arthur still needs to know why the player wants access.",
      { trust: has("polite", input) ? 4 : 0, irritation: has("polite", input) ? -3 : 2 }
    );
  }

  if (has("polite", input) && state.trust < 55) {
    return decide(
      "SHOW_SYMPATHY",
      0.69,
      "The player is respectful, so Arthur softens while keeping the entrance secure.",
      { trust: 7, suspicion: -2, irritation: -5 }
    );
  }

  return decide(
    "REFUSE_ENTRY",
    0.76,
    "Nothing in the player's latest statement overcomes Arthur's duty to keep the warehouse closed.",
    { suspicion: 3, irritation: turn > personality.patience / 10 ? 4 : 1 }
  );
}

export async function chooseNpcAction(context, availableActions) {
  await Promise.resolve();

  const decision = chooseRawDecision(context);
  if (context.playerInput.trim() === "[[invalid]]") return decision;
  if (availableActions.includes(decision.action)) return decision;

  if (decision.action === "ASK_FOR_REASON") {
    return decide(
      "REFUSE_ENTRY",
      Math.min(decision.confidence, 0.8),
      "Arthur already asked for a clear purpose, so he holds the boundary instead of repeating the question.",
      { suspicion: 3, irritation: 2 }
    );
  }

  const fallback = availableActions.includes("BECOME_SUSPICIOUS")
    ? "BECOME_SUSPICIOUS"
    : "REFUSE_ENTRY";

  return decide(
    fallback,
    Math.min(decision.confidence, 0.8),
    `${decision.reason} Arthur's current state prevents ${decision.action}, so he refuses to relax his guard.`,
    { suspicion: 5, irritation: 2 }
  );
}

export const MOCK_AVAILABLE_ACTIONS = Object.freeze([
  "ANSWER_QUESTION",
  "REFUSE_ENTRY",
  "ASK_FOR_REASON",
  "ASK_FOR_PROOF",
  "ALLOW_ENTRY",
  "WARN_PLAYER",
  "DEESCALATE_THREAT",
  "THREATEN_PLAYER",
  "SHOW_SYMPATHY",
  "BECOME_SUSPICIOUS",
  "REPAIR_CONVERSATION",
  "END_CONVERSATION"
]);
