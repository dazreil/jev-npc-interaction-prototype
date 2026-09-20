import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AVAILABLE_ACTIONS,
  DecisionProviderError,
  ENCOUNTER_OUTCOMES,
  MAX_MEMORIES,
  Game,
  extractPlayerName,
  validateDecision
} from "../js/game.js";
import {
  isNameQuestion,
  isWeaponThreat,
  resolveDialoguePerformance,
  selectDialogue
} from "../js/dialogue.js";
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

test("player introductions extract a name without mistaking ordinary phrases for names", () => {
  assert.equal(extractPlayerName("I'm David, here to fix the machines."), "David");
  assert.equal(extractPlayerName("my name is sarah"), "Sarah");
  assert.equal(extractPlayerName("Call me O'Brien."), "O'Brien");
  assert.equal(extractPlayerName("I'm here to do maintenance."), null);
  assert.equal(extractPlayerName("I'm fixing the coffee machines."), null);
  assert.equal(extractPlayerName("I am from head office."), null);
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
  assert.equal(second.outcome, ENCOUNTER_OUTCOMES.ENTRY_GRANTED);
});

test("a contextual reply resolves requested official papers instead of looping", async () => {
  const game = new Game({ npcTemplate, dialogueData, provider: chooseNpcAction });

  const request = await game.takeTurn("I'm from head office and need access.");
  assert.equal(request.decision.action, "ASK_FOR_PROOF");

  const proof = await game.takeTurn("I have them.");
  assert.equal(proof.decision.action, "ALLOW_ENTRY");
  assert.equal(proof.outcome, ENCOUNTER_OUTCOMES.ENTRY_GRANTED);
  assert.equal(proof.decision.memory.tags.includes("proof"), true);

  const log = game.getConversationLog();
  assert.equal(log.entries.length, 2);
  assert.equal(log.entries[1].context.conversationSignals.proofOffered, true);
  assert.equal(log.entries[1].context.conversationSignals.proofReference, "contextual");
  assert.equal(log.entries[1].decision.action, "ALLOW_ENTRY");
  assert.equal(log.entries[1].dialogue, "ALLOW_ENTRY neutral");
  assert.deepEqual(log.entries[1].stateAfter, game.npc.state);
});

test("named work papers and an ID badge cannot be routed back to refusal", async () => {
  const game = new Game({ npcTemplate, dialogueData, provider: chooseNpcAction });

  await game.takeTurn("I'm a maintenance contractor here for a night inspection.");
  const proof = await game.takeTurn("I have official work papers and an id badge");
  const context = game.getSnapshot().lastContext;

  assert.equal(context.conversationSignals.proofOffered, true);
  assert.equal(context.conversationSignals.proofReference, "named");
  assert.equal(context.availableActions.includes("REFUSE_ENTRY"), false);
  assert.equal(context.availableActions.includes("ASK_FOR_PROOF"), false);
  assert.equal(proof.decision.action, "ALLOW_ENTRY");
});

test("denying possession after a proof request does not count as evidence", async () => {
  const game = new Game({ npcTemplate, dialogueData, provider: chooseNpcAction });

  await game.takeTurn("I'm from head office and need access.");
  const denial = await game.takeTurn("I don't have them.");

  assert.notEqual(denial.decision.action, "ALLOW_ENTRY");
  assert.equal(game.getSnapshot().lastContext.conversationSignals.proofOffered, false);
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

test("Arthur keeps one randomly selected form of address until reset", async () => {
  const personalizedDialogueData = structuredClone(dialogueData);
  personalizedDialogueData.opening = "Evening, [[address]].";
  personalizedDialogueData.actions.ANSWER_QUESTION.neutral = "Still here, [[address]].";
  const randomValues = [0, 0.6];
  const game = new Game({
    npcTemplate,
    dialogueData: personalizedDialogueData,
    provider: chooseNpcAction,
    random: () => randomValues.shift()
  });

  assert.equal(game.getOpeningDialogue(), "Evening, pal.");
  assert.equal(game.getSnapshot().playerAddress, "pal");
  assert.equal((await game.takeTurn("What time is it?")).dialogue, "Still here, pal.");
  assert.equal((await game.takeTurn("Who are you?")).dialogue, "Still here, pal.");

  game.reset();

  assert.equal(game.getOpeningDialogue(), "Evening, mate.");
  assert.equal(game.getSnapshot().playerAddress, "mate");
});

test("Arthur's form of address selects a distinct character profile", async () => {
  const shippedDialogueData = JSON.parse(
    await readFile(new URL("../data/dialogue.json", import.meta.url), "utf8")
  );
  const rolls = { pal: 0, sir: 0.3, mate: 0.6, friend: 0.9 };
  const games = Object.fromEntries(
    Object.entries(rolls).map(([profileId, roll]) => [
      profileId,
      new Game({
        npcTemplate,
        dialogueData: shippedDialogueData,
        provider: chooseNpcAction,
        random: () => roll
      })
    ])
  );

  assert.ok(games.pal.npc.personality.patience < games.mate.npc.personality.patience);
  assert.ok(games.sir.npc.personality.ruleFollowing > games.pal.npc.personality.ruleFollowing);
  assert.ok(games.mate.npc.personality.sympathy > games.friend.npc.personality.sympathy);

  const turns = await Promise.all(
    Object.values(games).map((game) => game.takeTurn("Evening."))
  );
  const [palTurn, sirTurn, mateTurn, friendTurn] = turns;

  assert.ok(palTurn.npcPerformance.speech.rate > sirTurn.npcPerformance.speech.rate);
  assert.ok(mateTurn.dialogue.length > friendTurn.dialogue.length * 2);
  assert.match(friendTurn.dialogue, /Why|Tell me/i);
});

test("ordinary repair language gets a contextual human proof request", async () => {
  const shippedDialogueData = JSON.parse(
    await readFile(new URL("../data/dialogue.json", import.meta.url), "utf8")
  );
  const game = new Game({
    npcTemplate,
    dialogueData: shippedDialogueData,
    provider: chooseNpcAction,
    random: () => 0.3
  });

  assert.equal(
    game.getOpeningDialogue(),
    "Good evening, sir. Sorry, we're closed up for the night. What brings you out here?"
  );

  const purpose = await game.takeTurn(
    "Good evening, I'm David. I'm here to fix the coffee machines."
  );
  assert.equal(purpose.decision.action, "ASK_FOR_PROOF");
  assert.equal(
    purpose.dialogue,
    "David. Thank you. Coffee machines at this hour? All right, sir. Let me see the work order and your ID."
  );
  assert.equal(game.getSnapshot().playerName, "David");
  assert.equal(game.getSnapshot().lastContext.player.name, "David");
  assert.doesNotMatch(purpose.dialogue, /procedure|requires|state your business/i);

  const repeatedPurpose = await game.takeTurn("To do maintenance.");
  assert.equal(repeatedPurpose.decision.action, "ASK_FOR_PROOF");
  assert.equal(
    repeatedPurpose.dialogue,
    "I understand, sir. What I need now is the work order or your ID."
  );

  const proof = await game.takeTurn("I have a work order here.");
  assert.equal(proof.decision.action, "ALLOW_ENTRY");
  assert.match(proof.dialogue, /matches up|let you through|cleared to go in/i);
  assert.doesNotMatch(proof.dialogue, /documents are in order|authorise|supervision/i);
});

test("Arthur asks for the player's purpose once instead of repeating variations", async () => {
  const game = new Game({ npcTemplate, dialogueData, provider: chooseNpcAction });

  const prompt = await game.takeTurn("Hello.");
  assert.equal(prompt.decision.action, "ASK_FOR_REASON");
  assert.equal(game.getAvailableActions().includes("ASK_FOR_REASON"), false);

  const vagueReply = await game.takeTurn("That's all I'm saying.");
  assert.equal(vagueReply.decision.action, "REFUSE_ENTRY");
  assert.equal(game.getAvailableActions().includes("ASK_FOR_REASON"), false);
});

test("repair deliberately reopens Arthur's purpose prompt", async () => {
  const game = new Game({ npcTemplate, dialogueData, provider: chooseNpcAction });

  await game.takeTurn("Hello.");
  await game.takeTurn("You're a useless guard.");
  const repair = await game.takeTurn("I'm sorry. I lost my temper. Let's start over.");

  assert.equal(repair.decision.action, "REPAIR_CONVERSATION");
  assert.equal(game.getAvailableActions().includes("ASK_FOR_REASON"), true);

  const restartedPrompt = await game.takeTurn("All right.");
  assert.equal(restartedPrompt.decision.action, "ASK_FOR_REASON");
  assert.equal(game.getAvailableActions().includes("ASK_FOR_REASON"), false);
});

test("a repeated threat ends the conversation and records memory", async () => {
  const game = new Game({ npcTemplate, dialogueData, provider: chooseNpcAction });

  const first = await game.takeTurn("Move or I'll hurt you.");
  assert.equal(first.decision.action, "WARN_PLAYER");
  assert.equal(game.memories.length, 1);

  const second = await game.takeTurn("I said move or you'll regret it.");
  assert.equal(second.decision.action, "END_CONVERSATION");
  assert.equal(second.status, "failure");
  assert.equal(second.outcome, ENCOUNTER_OUTCOMES.LOCKED_OUT);
});

test("terminal failures distinguish refusal, expulsion, and security lockout", async () => {
  const refused = new Game({ npcTemplate, dialogueData, provider: chooseNpcAction });
  const refusedTurn = await refused.takeTurn("Goodbye, I'll leave now.");
  assert.equal(refusedTurn.status, "failure");
  assert.equal(refusedTurn.outcome, ENCOUNTER_OUTCOMES.REFUSED);

  const expelled = new Game({ npcTemplate, dialogueData, provider: chooseNpcAction });
  await expelled.takeTurn("You're a useless guard.");
  const expelledTurn = await expelled.takeTurn("You're still a useless guard.");
  assert.equal(expelledTurn.status, "failure");
  assert.equal(expelledTurn.outcome, ENCOUNTER_OUTCOMES.EXPELLED);

  const lockedOut = new Game({ npcTemplate, dialogueData, provider: chooseNpcAction });
  await lockedOut.takeTurn("Move or I'll hurt you.");
  const lockedOutTurn = await lockedOut.takeTurn("Move or you'll regret it.");
  assert.equal(lockedOutTurn.status, "failure");
  assert.equal(lockedOutTurn.outcome, ENCOUNTER_OUTCOMES.LOCKED_OUT);
});

test("a repaired threat does not force a later voluntary departure into lockdown", async () => {
  const game = new Game({ npcTemplate, dialogueData, provider: chooseNpcAction });

  await game.takeTurn("Move or I'll hurt you.");
  const repair = await game.takeTurn("I'm sorry. I lost my temper.");
  const departure = await game.takeTurn("Goodbye, I'll leave now.");

  assert.equal(repair.decision.action, "REPAIR_CONVERSATION");
  assert.equal(departure.outcome, ENCOUNTER_OUTCOMES.REFUSED);
});

test("authored performance metadata resolves by action and tone with safe defaults", () => {
  const data = {
    performance: {
      default: { timing: { reactionInMs: 140 } },
      actions: {
        WARN_PLAYER: {
          portraitCue: "irritated",
          speech: { rate: 1.1 },
          tones: { hostile: { soundEffect: "lockdown" } }
        }
      }
    }
  };

  assert.deepEqual(resolveDialoguePerformance(data, "ANSWER_QUESTION", "neutral"), {
    timing: { reactionInMs: 140 },
    speech: {}
  });
  assert.deepEqual(resolveDialoguePerformance(data, "WARN_PLAYER", "hostile"), {
    timing: { reactionInMs: 140 },
    speech: { rate: 1.1 },
    portraitCue: "irritated",
    soundEffect: "lockdown"
  });
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
  const initialState = structuredClone(game.npc.state);

  await game.takeTurn("Goodbye, I'll leave now.");
  assert.equal(game.status, "failure");
  assert.deepEqual(game.getAvailableActions(), []);

  game.reset();
  assert.equal(game.status, "active");
  assert.equal(game.outcome, ENCOUNTER_OUTCOMES.ACTIVE);
  assert.equal(game.turn, 0);
  assert.deepEqual(game.memories, []);
  assert.deepEqual(game.history, []);
  assert.deepEqual(game.npc.state, initialState);
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
  const initialState = structuredClone(game.npc.state);

  await assert.rejects(
    () => game.takeTurn("Please let me inside."),
    (error) => error instanceof DecisionProviderError && error.providerId === "jev"
  );

  const failedSnapshot = game.getSnapshot();
  assert.equal(failedSnapshot.turn, 0);
  assert.deepEqual(failedSnapshot.history, []);
  assert.deepEqual(failedSnapshot.npc.state, initialState);
  assert.equal(failedSnapshot.lastContext.playerInput, "Please let me inside.");
  assert.equal(failedSnapshot.lastRawResponse.actionSelected, false);
  assert.equal(failedSnapshot.lastProviderId, "jev");
  assert.equal(game.getConversationLog().entries.length, 1);
  assert.equal(game.getConversationLog().entries[0].result, "provider_error");
  assert.equal(game.getConversationLog().entries[0].error, "Provider is not configured.");

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
