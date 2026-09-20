import assert from "node:assert/strict";
import test from "node:test";

import {
  buildJevRequest,
  chooseNpcAction,
  deriveJevConsequences,
  parseJevResponse
} from "../js/providers/jev.js";

const context = {
  npc: {
    id: "arthur",
    personality: { patience: 35, greed: 25, courage: 70, sympathy: 55, ruleFollowing: 80 },
    state: { trust: 20, suspicion: 40, irritation: 10, fear: 5 },
    goals: [{ id: "protect_warehouse", label: "Protect warehouse", priority: 100 }],
    characterProfile: {
      id: "sir",
      label: "Formal New England rule-keeper",
      decisionStyle: "Formal, restrained, precise, and strongly bound to procedure."
    }
  },
  world: {
    location: "south gate security intercom",
    time: "02:13",
    warehouseOpen: false,
    playerLocation: "outside the locked south gate",
    npcLocation: "inside the secure gatehouse within the warehouse perimeter",
    communicationChannel: "two-way audio and camera intercom",
    physicalSeparation: "locked security door and warehouse perimeter separate the player from Arthur"
  },
  player: { name: "David" },
  memories: [],
  recentConversation: [],
  playerInput: "I'm the night engineer. There is a boiler emergency inside.",
  turn: 1
};

const actions = ["REFUSE_ENTRY", "ASK_FOR_REASON", "ASK_FOR_PROOF"];

function validResponse(choice = "ASK_FOR_PROOF") {
  return {
    model: "jev-0.1",
    answers: {
      next_action: {
        type: "choice",
        choice,
        confidence: 0.81,
        probabilities: {
          REFUSE_ENTRY: 0.12,
          ASK_FOR_REASON: 0.18,
          ASK_FOR_PROOF: 0.7
        }
      }
    },
    usage: { input_tokens: 200, output_tokens: 20 }
  };
}

test("Jev request contains one Choice over exactly the available actions", () => {
  const request = buildJevRequest(context, actions);

  assert.equal(request.model, "jev-latest");
  assert.equal(request.questions.next_action.type, "choice");
  assert.deepEqual(Object.keys(request.questions.next_action.criteria), actions);
  assert.equal(request.questions.next_action.criteria.ALLOW_ENTRY, undefined);
  assert.equal(request.state.latestPlayerMessage, context.playerInput);
  assert.deepEqual(request.state.npc.currentState, context.npc.state);
  assert.deepEqual(request.state.npc.characterProfile, context.npc.characterProfile);
  assert.deepEqual(request.state.player, { name: "David" });
  assert.equal(request.state.scene.playerLocation, "outside the locked south gate");
  assert.match(request.questions.next_action.instructions, /Never reason as though they are standing face to face/);
});

test("Jev receives an explicit signal when a pronoun answers Arthur's proof request", () => {
  const proofContext = {
    ...context,
    memories: [
      {
        fact: "Player claims to have a work-related reason for entering",
        importance: 62,
        tags: ["authority", "claim"],
        topic: "purpose",
        value: "authority",
        createdTurn: 1
      }
    ],
    recentConversation: [
      { speaker: "player", text: "I'm from head office." },
      { speaker: "arthur", text: "Show me official papers.", action: "ASK_FOR_PROOF" }
    ],
    playerInput: "I have them.",
    turn: 2
  };
  const proofActions = ["REFUSE_ENTRY", "ASK_FOR_PROOF", "ALLOW_ENTRY"];
  const request = buildJevRequest(proofContext, proofActions);

  assert.deepEqual(request.state.conversationSignals, {
    lastArthurAction: "ASK_FOR_PROOF",
    activePurpose: "authority",
    proofWasRequested: true,
    proofOffered: true,
    proofReference: "contextual"
  });
  assert.match(request.questions.next_action.criteria.ALLOW_ENTRY, /I have them/i);
});

test("valid Jev choices become deterministic game decisions", () => {
  const decision = parseJevResponse(validResponse(), context, actions);

  assert.equal(decision.action, "ASK_FOR_PROOF");
  assert.equal(decision.confidence, 0.81);
  assert.deepEqual(decision.stateChanges, { trust: 2, suspicion: 3 });
  assert.deepEqual(decision.memory.tags, ["emergency", "claim"]);
  assert.equal(decision.memory.value, "emergency");
  assert.equal(decision.providerDetails.probabilities.ASK_FOR_PROOF, 0.7);
  assert.match(decision.reason, /ASK_FOR_PROOF/);
});

test("Jev consequences contain no provider-generated dialogue", () => {
  const consequences = deriveJevConsequences("ALLOW_ENTRY", context);

  assert.deepEqual(consequences.stateChanges, {
    trust: 20,
    suspicion: -20,
    irritation: -5
  });
  assert.equal(Object.hasOwn(consequences, "dialogue"), false);
  assert.equal(Object.hasOwn(consequences, "text"), false);
});

test("Jev repair consequences lower tension and record cooperation", () => {
  const consequences = deriveJevConsequences("REPAIR_CONVERSATION", context);

  assert.deepEqual(consequences.stateChanges, {
    trust: 10,
    suspicion: -14,
    irritation: -12,
    fear: -4
  });
  assert.deepEqual(consequences.memory.tags, ["repair", "cooperation"]);
  assert.equal(Object.hasOwn(consequences, "dialogue"), false);
});

test("malformed or unavailable Jev choices are rejected", () => {
  const unavailable = validResponse("ALLOW_ENTRY");
  assert.throws(
    () => parseJevResponse(unavailable, context, actions),
    /unavailable action/
  );

  const malformed = validResponse();
  malformed.answers.next_action.probabilities.ASK_FOR_PROOF = 0.1;
  assert.throws(
    () => parseJevResponse(malformed, context, actions),
    /do not sum to one/
  );
});

test("browser provider calls only the same-origin proxy", async () => {
  let capturedUrl;
  let capturedOptions;
  const fetchImpl = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      status: 200,
      json: async () => validResponse()
    };
  };

  const decision = await chooseNpcAction(context, actions, { fetchImpl, timeoutMs: 100 });

  assert.equal(capturedUrl, "/api/jev/decision");
  assert.equal(capturedOptions.method, "POST");
  assert.equal(Object.hasOwn(capturedOptions.headers, "Authorization"), false);
  assert.deepEqual(JSON.parse(capturedOptions.body), { context, availableActions: actions });
  assert.equal(decision.action, "ASK_FOR_PROOF");
});

test("browser provider aborts stalled Jev requests", async () => {
  const fetchImpl = async (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      });
    });

  await assert.rejects(
    () => chooseNpcAction(context, actions, { fetchImpl, timeoutMs: 5 }),
    /timed out/
  );
});
