const NAMED_PROOF_PATTERN =
  /\b(id|identification|badge|work order|authorisation|authorization|letter|pass|credentials?|employee number|manager reference|manifest|invoice|delivery note|papers?|documents?|documentation|permit|licen[cs]e)\b/i;
const PROOF_DENIAL_PATTERN =
  /\b(?:do not|don't|did not|didn't|have no|haven't|have not|without|lost|forgot|cannot|can't)\b/i;
const REFERENTIAL_PROOF_PATTERN =
  /\b(?:i (?:have|got) (?:it|them|those|that)|i(?:'ve| have) got (?:it|them|those)|here (?:it is|they are)|they(?:'re| are) right here|it(?:'s| is) right here|i do)\b/i;
const WITHHOLDING_PATTERN =
  /\b(?:none of your (?:business|concern)|not telling you|won't say|will not say|why should i|mind your own|that's my business|no comment|doesn't matter|does not matter|not your problem)\b/i;

export const PURPOSE_PATTERNS = Object.freeze({
  emergency: /\b(boiler|gas|leak|fire|smoke|alarm|pressure|flood|emergency|burst|electrical|sparks)\b/i,
  authority: /\b(head office|management|manager|inspector|inspection|contractor|engineer|technician|maintenance|maintanance|mantenice|boss(?:es)? sent me|sent by (?:the )?(?:boss|management)|work(?:s| here)?\b|working|job|shift|call(?:ed)?[- ]out|service call|work order|employee|staff|fix(?:ing)? (?:the )?(?:coffee )?machines?)\b/i,
  delivery: /\b(delivery|courier|package|parcel|shipment|drop off|driver)\b/i,
  personal: /\b(left my|forgot my|my bag|my phone|meet someone|friend inside|personal item)\b/i
});

/**
 * Actions that can leave the player owing Arthur a response, mapped to the
 * subject he is waiting on.
 *
 * A pending request is not always a question. ASK_FOR_REASON and ASK_FOR_PROOF
 * exist in order to ask for something, and most of their authored lines are
 * directives rather than questions ("Hold your badge up to the camera."), so
 * they always leave a request outstanding regardless of punctuation. The others
 * put something to the player only in some tones, so they count only when the
 * rendered line actually contains a question mark.
 */
export const REQUEST_TOPICS = Object.freeze({
  ASK_FOR_REASON: { topic: "purpose", always: true },
  ASK_FOR_PROOF: { topic: "proof", always: true },
  ANSWER_QUESTION: { topic: "purpose", always: false },
  BECOME_SUSPICIOUS: { topic: "explanation", always: false },
  REPAIR_CONVERSATION: { topic: "next-step", always: false }
});

export function inferPurpose(input) {
  return Object.entries(PURPOSE_PATTERNS).find(([, pattern]) => pattern.test(input))?.[0] ?? null;
}

function latestArthurAction(recentConversation = []) {
  return recentConversation
    .filter((entry) => entry?.speaker === "arthur" && entry.action)
    .at(-1)?.action ?? null;
}

function latestPurpose(memories = []) {
  return memories
    .filter((memory) => memory?.topic === "purpose" && memory.value)
    .sort((left, right) => (Number(right.createdTurn) || 0) - (Number(left.createdTurn) || 0))[0]
    ?.value ?? null;
}

export function hasUnresolvedSuspicion(memories = []) {
  const latestRepairTurn = memories.reduce(
    (latest, memory) =>
      memory?.tags?.includes("repair")
        ? Math.max(latest, Number(memory.createdTurn) || 0)
        : latest,
    -1
  );

  return memories.some(
    (memory) =>
      (memory?.tags?.some((tag) =>
        ["suspicion", "contradiction", "dishonesty", "lie", "bribe"].includes(tag)
      ) ?? false) &&
      (Number(memory.createdTurn) || 0) > latestRepairTurn
  );
}

/**
 * Records what Arthur just put to the player, so it can outlive the turn that
 * raised it.
 */
export function resolvePendingRequest(action, dialogue, askedTurn) {
  const entry = REQUEST_TOPICS[action];
  if (!entry) return null;
  if (!entry.always && !String(dialogue ?? "").includes("?")) return null;

  return { action, topic: entry.topic, askedTurn: Number(askedTurn) || 0 };
}

/**
 * Judges the player's reply against the request still outstanding.
 *
 * Deliberately conservative. "satisfied" and "refused" are only reported on
 * explicit textual evidence; everything else stays "unclear" so that Jev makes
 * the semantic call rather than a regular expression.
 */
export function classifyResponse(playerInput, pendingRequest) {
  if (!pendingRequest) return "none";

  const input = String(playerInput ?? "").trim();
  if (!input) return "unclear";
  if (WITHHOLDING_PATTERN.test(input)) return "refused";

  if (pendingRequest.topic === "proof") {
    if (PROOF_DENIAL_PATTERN.test(input)) return "refused";
    // A vague reference such as "I have them" acknowledges the request but
    // does not give Arthur anything concrete to inspect through the camera.
    if (NAMED_PROOF_PATTERN.test(input)) return "satisfied";
    return "unclear";
  }

  if (pendingRequest.topic === "purpose") {
    return inferPurpose(input) ? "satisfied" : "unclear";
  }

  return "unclear";
}

export function deriveConversationSignals({
  playerInput,
  recentConversation = [],
  memories = [],
  pendingRequest = undefined,
  turn = 0
}) {
  const input = String(playerInput ?? "").trim();
  const lastArthurAction = latestArthurAction(recentConversation);

  // A caller that does not track pending questions falls back to the previous
  // single-turn behaviour, where only Arthur's most recent line can be pending.
  const question =
    pendingRequest === undefined
      ? resolvePendingRequest(lastArthurAction, "?", (Number(turn) || 0) - 1)
      : pendingRequest;

  const responseStatus = classifyResponse(input, question);
  const deniesProof = PROOF_DENIAL_PATTERN.test(input);
  const namesProof = NAMED_PROOF_PATTERN.test(input) && !deniesProof;
  const proofWasRequested = question?.topic === "proof";
  const refersToRequestedProof =
    proofWasRequested && REFERENTIAL_PROOF_PATTERN.test(input) && !deniesProof;

  return {
    lastArthurAction,
    activePurpose: latestPurpose(memories),
    pendingRequest: question
      ? {
          action: question.action,
          topic: question.topic,
          askedTurn: question.askedTurn,
          turnsOutstanding: Math.max(0, (Number(turn) || 0) - question.askedTurn)
        }
      : null,
    responseStatus,
    proofWasRequested,
    proofOffered: namesProof,
    proofReference: namesProof ? "named" : refersToRequestedProof ? "contextual" : "none",
    unresolvedSuspicion: hasUnresolvedSuspicion(memories)
  };
}
