import assert from "node:assert/strict";
import test from "node:test";

import {
  AVAILABLE_ACTIONS,
  DecisionProviderError,
  MAX_MEMORIES,
  Game,
  validateDecision
} from "../js/game.js";
import { isNameQuestion, isWeaponThreat, selectDialogue } from "../js/dialogue.js";
import { assessMessageEffort, determineTone } from "../js/npc.js";
import { chooseNpcAction } from "../js/providers/mock.js";

const npcTemplate = {
  id: "arthur",
  name: "Arthur",
  personality: { patience: 35, greed: 25, courage: 70, sympathy: 55, ruleFollowing: 80 },
  state: { trust: 20, suspicion: 40, irritation: 10, fear: 5 },
  goals: [{ id: "protect_warehouse", label: "Protect warehouse", priority: 100 }]
};

const dialogueData = {
  opening: "Evening.",
  actions: Object.fromEntries(
    AVAILABLE_ACTIONS.map((action) => [
      action,
      {
        neutral: `${action} neutral`,
        friendly: `${action} friendly`,
        irritated: `${action} irritated`,
        hostile: `${action} hostile`
      }
    ])
  )
};

test("invalid provider actions use a safe authored fallback", () => {
  const result = validateDecision(
    { action: "INVENTED_ACTION", confidence: 0.99, reason: "Should not escape." },
    AVAILABLE_ACTIONS
  );

  assert.equal(result.action, "REFUSE_ENTRY");
  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(result.stateChanges, {});
  assert.equal(result.memory, null);
});

test("tone thresholds follow the spec", () => {
  assert.equal(determineTone({ trust: 90, irritation: 71 }), "hostile");
  assert.equal(determineTone({ trust: 90, irritation: 41 }), "irritated");
  assert.equal(determineTone({ trust: 66, irritation: 40 }), "friendly");
  assert.equal(determineTone({ trust: 65, irritation: 40 }), "neutral");
});

test("message effort makes terse replies slightly more irritating", () => {
  assert.deepEqual(assessMessageEffort("name?").stateChanges, { trust: -1, irritation: 2 });
  assert.equal(assessMessageEffort("name?").label, "terse");
  assert.equal(assessMessageEffort("Please explain why the warehouse is closed tonight.").label, "ordinary");
});

test("a supported head-office claim can lead to authored entry dialogue", async () => {
  const game = new Game({ npcTemplate, dialogueData, provider: chooseNpcAction });

  assert.equal(game.getAvailableActions().includes("ALLOW_ENTRY"), false);

  const first = await game.takeTurn("I'm from head office and need access, please.");
  assert.equal(first.decision.action, "ASK_FOR_PROOF");
  assert.equal(game.getAvailableActions().includes("ALLOW_ENTRY"), true);

  const second = await game.takeTurn("Here is my work ID badge and authorisation letter.");
  assert.equal(second.decision.action, "ALLOW_ENTRY");
  assert.equal(second.dialogue, "ALLOW_ENTRY neutral");
  assert.equal(second.status, "success");
});

test("asking Arthur's name uses the authored name response", async () => {
  const nameDialogueData = structuredClone(dialogueData);
  nameDialogueData.actions.ANSWER_QUESTION.name = "Arthur. I'm the night guard here. What do you need?";
  const game = new Game({
    npcTemplate,
    dialogueData: nameDialogueData,
    provider: chooseNpcAction
  });

  const turn = await game.takeTurn("name?");

  assert.equal(isNameQuestion(turn.playerInput), true);
  assert.equal(turn.decision.action, "ANSWER_QUESTION");
  assert.match(turn.dialogue, /Arthur/i);
  assert.equal(isNameQuestion("your name what is it"), true);
});

test("a repeated threat ends the conversation and records memory", async () => {
  const game = new Game({ npcTemplate, dialogueData, provider: chooseNpcAction });

  const first = await game.takeTurn("Move or I'll hurt you.");
  assert.equal(first.decision.action, "WARN_PLAYER");
  assert.equal(game.memories.length, 1);

  const second = await game.takeTurn("I said move or you'll regret it.");
  assert.equal(second.decision.action, "END_CONVERSATION");
  assert.equal(second.status, "failure");
});

test("a first gun threat uses an authored de-escalation response and serious memory", async () => {
  const weaponDialogueData = structuredClone(dialogueData);
  weaponDialogueData.actions.DEESCALATE_THREAT.weapon =
    "Keep the gun pointed at the ground. Tell me what you need.";
  const game = new Game({
    npcTemplate,
    dialogueData: weaponDialogueData,
    provider: chooseNpcAction
  });

  const turn = await game.takeTurn("Open the door or I'll shoot.");

  assert.equal(isWeaponThreat(turn.playerInput), true);
  assert.equal(turn.decision.action, "DEESCALATE_THREAT");
  assert.match(turn.dialogue, /lower|ground|hurt|need/i);
  assert.ok(game.memories[0].tags.includes("weapon"));
});

test("history and memories stay bounded over a long conversation", async () => {
  const passiveProvider = async (context, _actions) => ({
    action: "ANSWER_QUESTION",
    confidence: 0.5,
    reason: "Test response.",
    stateChanges: {},
    memory: {
      fact: `Unique memory ${context.turn}`,
      importance: context.turn,
      tags: ["test"]
    }
  });
  const game = new Game({ npcTemplate, dialogueData, provider: passiveProvider });

  for (let index = 0; index < 10; index += 1) {
    await game.takeTurn(`Question ${index}?`);
  }

  assert.equal(game.history.length, 12);
  assert.equal(game.memories.length, MAX_MEMORIES);
  assert.equal(game.memories[0].fact, "Unique memory 10");
  assert.equal(game.status, "active");
});

test("a detailed emergency can provide a second route to entry", async () => {
  const game = new Game({ npcTemplate, dialogueData, provider: chooseNpcAction });

  const first = await game.takeTurn("There is a boiler emergency inside.");
  assert.equal(first.decision.action, "ASK_FOR_PROOF");

  const second = await game.takeTurn(
    "The boiler pressure valve in unit B has failed and the night engineer called me."
  );
  assert.equal(second.decision.action, "ALLOW_ENTRY");
  assert.equal(second.status, "success");
});

test("sustained respectful behaviour can earn a third route to entry", async () => {
  const game = new Game({ npcTemplate, dialogueData, provider: chooseNpcAction });
  const respectfulLines = [
    "Please, I appreciate your time.",
    "Thank you for listening, sir.",
    "I understand, and I appreciate you speaking with me.",
    "Thanks for being patient with me, sir.",
    "I understand you have a job to do, thank you.",
    "I appreciate that, sir."
  ];

  for (const line of respectfulLines) {
    const turn = await game.takeTurn(line);
    assert.notEqual(turn.status, "failure");
  }

  assert.ok(game.npc.state.trust >= 55);
  const finalTurn = await game.takeTurn("Please make an exception and let me in.");
  assert.equal(finalTurn.decision.action, "ALLOW_ENTRY");
  assert.equal(finalTurn.status, "success");
});

test("contradicting a remembered purpose makes Arthur suspicious", async () => {
  const game = new Game({ npcTemplate, dialogueData, provider: chooseNpcAction });

  await game.takeTurn("I have a delivery for the warehouse.");
  const contradiction = await game.takeTurn(
    "Actually, my friend inside has my phone and I need it back."
  );

  assert.equal(contradiction.decision.action, "BECOME_SUSPICIOUS");
  assert.ok(game.memories.some((memory) => memory.tags.includes("contradiction")));
  assert.ok(game.npc.state.suspicion >= 70);
  assert.equal(game.getAvailableActions().includes("ALLOW_ENTRY"), false);
});

test("an honest repair can reopen the path from suspicion to proof", async () => {
  const repairDialogueData = structuredClone(dialogueData);
  repairDialogueData.actions.REPAIR_CONVERSATION.neutral =
    "All right. Let's start again and explain the real reason.";
  const game = new Game({
    npcTemplate,
    dialogueData: repairDialogueData,
    provider: chooseNpcAction
  });

  await game.takeTurn("I'm from head office for a night inspection.");
  await game.takeTurn("Actually, I need my phone from inside.");
  assert.equal(game.getAvailableActions().includes("ALLOW_ENTRY"), false);

  const repair = await game.takeTurn(
    "I'm sorry. I was frustrated and should have explained myself clearly."
  );

  assert.equal(repair.decision.action, "REPAIR_CONVERSATION");
  assert.match(repair.dialogue, /start again|explain|honesty|truth/i);
  assert.ok(game.memories.some((memory) => memory.tags.includes("repair")));
  assert.equal(game.getAvailableActions().includes("ALLOW_ENTRY"), true);

  const proof = await game.takeTurn(
    "Here is my work ID badge and signed authorisation letter."
  );
  assert.equal(proof.decision.action, "ALLOW_ENTRY");
  assert.equal(proof.status, "success");
});

test("authored variants rotate deterministically", () => {
  const data = {
    actions: {
      TEST: { neutral: ["First authored line.", "Second authored line."] }
    }
  };

  assert.equal(selectDialogue(data, "TEST", "neutral", 0), "First authored line.");
  assert.equal(selectDialogue(data, "TEST", "neutral", 1), "Second authored line.");
  assert.equal(selectDialogue(data, "TEST", "neutral", 2), "First authored line.");
});

test("authored templates combine slots and select a matching dialogue branch", () => {
  const data = {
    actions: {
      TEST: {
        neutral: {
          template: "{opening} {close}",
          slots: {
            opening: ["The door stays shut.", "The entrance stays closed."],
            close: ["Bring proof.", "Show me what you have."]
          },
          branches: [
            {
              when: { memoryTag: "repair" },
              template: "We can continue. {close}",
              slots: { close: ["Give me the evidence."] }
            }
          ]
        }
      }
    }
  };

  assert.equal(
    selectDialogue(data, "TEST", "neutral", 0),
    "The door stays shut. Bring proof."
  );
  assert.equal(
    selectDialogue(data, "TEST", "neutral", 0, {
      dialogueContext: { memories: [{ tags: ["repair"] }] }
    }),
    "We can continue. Give me the evidence."
  );
});

test("weapon context takes precedence over emotional tone for authored dialogue", () => {
  const data = {
    actions: {
      WARN_PLAYER: {
        hostile: "generic hostile line",
        weapon: "lower the weapon"
      }
    }
  };

  assert.equal(
    selectDialogue(data, "WARN_PLAYER", "hostile", 0, {
      playerInput: "I have a gun."
    }),
    "lower the weapon"
  );
});

test("terminal state removes all actions and reset clears transient state", async () => {
  const game = new Game({ npcTemplate, dialogueData, provider: chooseNpcAction });

  await game.takeTurn("Goodbye, I'll leave now.");
  assert.equal(game.status, "failure");
  assert.deepEqual(game.getAvailableActions(), []);

  game.reset();
  assert.equal(game.status, "active");
  assert.equal(game.turn, 0);
  assert.deepEqual(game.memories, []);
  assert.deepEqual(game.history, []);
  assert.deepEqual(game.npc.state, npcTemplate.state);
});

test("provider failure is inspectable, consumes no turn, and permits recovery", async () => {
  const failingProvider = async () => {
    throw new Error("Provider is not configured.");
  };
  const game = new Game({
    npcTemplate,
    dialogueData,
    provider: failingProvider,
    providerId: "jev"
  });

  await assert.rejects(
    () => game.takeTurn("Please let me inside."),
    (error) => error instanceof DecisionProviderError && error.providerId === "jev"
  );

  const failedSnapshot = game.getSnapshot();
  assert.equal(failedSnapshot.turn, 0);
  assert.deepEqual(failedSnapshot.history, []);
  assert.deepEqual(failedSnapshot.npc.state, npcTemplate.state);
  assert.equal(failedSnapshot.lastContext.playerInput, "Please let me inside.");
  assert.equal(failedSnapshot.lastRawResponse.actionSelected, false);
  assert.equal(failedSnapshot.lastProviderId, "jev");

  game.setProvider(chooseNpcAction, "mock");
  const recoveredTurn = await game.takeTurn("Please let me inside.");
  assert.equal(recoveredTurn.decision.action, "ASK_FOR_REASON");
  assert.equal(game.getSnapshot().lastProviderError, null);
});

test("inspection data records raw invalid output and validated fallback", async () => {
  const invalidProvider = async () => ({
    action: "OPEN_A_PORTAL",
    confidence: 0.98,
    reason: "Invalid test action."
  });
  const game = new Game({
    npcTemplate,
    dialogueData,
    provider: invalidProvider,
    providerId: "test"
  });

  await game.takeTurn("Hello Arthur.");
  const snapshot = game.getSnapshot();

  assert.equal(snapshot.lastRawResponse.action, "OPEN_A_PORTAL");
  assert.equal(snapshot.lastDecision.action, "REFUSE_ENTRY");
  assert.equal(snapshot.lastDecision.fallbackUsed, true);
  assert.equal(snapshot.lastDecision.invalidAction, "OPEN_A_PORTAL");
});
