const NAMED_PROOF_PATTERN =
  /\b(id|identification|badge|work order|authorisation|authorization|letter|pass|credentials?|employee number|manager reference|manifest|invoice|delivery note|papers?|documents?|documentation|permit|licen[cs]e)\b/i;
const PROOF_DENIAL_PATTERN =
  /\b(?:do not|don't|did not|didn't|have no|haven't|have not|without|lost|forgot|cannot|can't)\b/i;
const REFERENTIAL_PROOF_PATTERN =
  /\b(?:i (?:have|got) (?:it|them|those|that)|i(?:'ve| have) got (?:it|them|those)|here (?:it is|they are)|they(?:'re| are) right here|it(?:'s| is) right here|i do)\b/i;

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

export function deriveConversationSignals({ playerInput, recentConversation = [], memories = [] }) {
  const input = String(playerInput ?? "").trim();
  const lastArthurAction = latestArthurAction(recentConversation);
  const proofWasRequested = lastArthurAction === "ASK_FOR_PROOF";
  const deniesProof = PROOF_DENIAL_PATTERN.test(input);
  const namesProof = NAMED_PROOF_PATTERN.test(input) && !deniesProof;
  const refersToRequestedProof =
    proofWasRequested && REFERENTIAL_PROOF_PATTERN.test(input) && !deniesProof;

  return {
    lastArthurAction,
    activePurpose: latestPurpose(memories),
    proofWasRequested,
    proofOffered: namesProof || refersToRequestedProof,
    proofReference: namesProof ? "named" : refersToRequestedProof ? "contextual" : "none",
    unresolvedSuspicion: hasUnresolvedSuspicion(memories)
  };
}
