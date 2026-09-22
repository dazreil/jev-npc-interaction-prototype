import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyResponse,
  deriveConversationSignals,
  resolvePendingRequest
} from "../js/conversation-signals.js";

const proofRequest = { action: "ASK_FOR_PROOF", topic: "proof", askedTurn: 3 };

test("an imperative proof request still leaves a question outstanding", () => {
  assert.deepEqual(
    resolvePendingRequest("ASK_FOR_PROOF", "Hold your badge up to the camera.", 3),
    proofRequest
  );
  assert.deepEqual(resolvePendingRequest("ASK_FOR_REASON", "Tell me why you're here.", 1), {
    action: "ASK_FOR_REASON",
    topic: "purpose",
    askedTurn: 1
  });
});

test("incidental actions only ask when the authored line contains a question", () => {
  assert.equal(
    resolvePendingRequest("ANSWER_QUESTION", "Name's Arthur. What do you need?", 2)?.topic,
    "purpose"
  );
  assert.equal(resolvePendingRequest("ANSWER_QUESTION", "Name's Arthur.", 2), null);
  assert.equal(resolvePendingRequest("REFUSE_ENTRY", "Not tonight?", 2), null);
});

test("a pending question outlives the turns that dodged it", () => {
  const dodged = deriveConversationSignals({
    playerInput: "it is freezing out here",
    recentConversation: [{ speaker: "arthur", text: "Not tonight.", action: "REFUSE_ENTRY" }],
    memories: [],
    pendingRequest: proofRequest,
    turn: 4
  });

  assert.equal(dodged.responseStatus, "unclear");
  assert.equal(dodged.pendingRequest.turnsOutstanding, 1);
  assert.equal(dodged.proofOffered, false);

  // The same vague reply still refers to Arthur's request, but it is not proof.
  const answeredLate = deriveConversationSignals({
    playerInput: "I have them",
    recentConversation: [{ speaker: "arthur", text: "Not tonight.", action: "REFUSE_ENTRY" }],
    memories: [],
    pendingRequest: proofRequest,
    turn: 6
  });

  assert.equal(answeredLate.responseStatus, "unclear");
  assert.equal(answeredLate.proofOffered, false);
  assert.equal(answeredLate.proofReference, "contextual");
  assert.equal(answeredLate.pendingRequest.turnsOutstanding, 3);
});

test("classifyResponse reports refusal, named evidence, and honest uncertainty", () => {
  assert.equal(classifyResponse("I have them", proofRequest), "unclear");
  assert.equal(classifyResponse("here is my id badge", proofRequest), "satisfied");
  assert.equal(classifyResponse("I don't have any papers", proofRequest), "refused");
  assert.equal(classifyResponse("none of your business", proofRequest), "refused");
  assert.equal(classifyResponse("nice weather", proofRequest), "unclear");
  assert.equal(classifyResponse("", proofRequest), "unclear");
  assert.equal(classifyResponse("anything at all", null), "none");
});

test("a purpose request is satisfied only by a recognisable purpose", () => {
  const reasonRequest = { action: "ASK_FOR_REASON", topic: "purpose", askedTurn: 1 };

  assert.equal(classifyResponse("I'm here for a delivery", reasonRequest), "satisfied");
  assert.equal(classifyResponse("there's a gas leak inside", reasonRequest), "satisfied");
  assert.equal(classifyResponse("just let me in", reasonRequest), "unclear");
  assert.equal(classifyResponse("why should i tell you", reasonRequest), "refused");
});

test("callers that track no pending question keep the previous behaviour", () => {
  const signals = deriveConversationSignals({
    playerInput: "I have them",
    recentConversation: [
      { speaker: "arthur", text: "Show me official papers.", action: "ASK_FOR_PROOF" }
    ],
    memories: [],
    turn: 2
  });

  assert.equal(signals.proofWasRequested, true);
  assert.equal(signals.proofOffered, false);
  assert.equal(signals.proofReference, "contextual");
  assert.equal(signals.pendingRequest.askedTurn, 1);
});
