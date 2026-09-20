import assert from "node:assert/strict";
import test from "node:test";

import { AVAILABLE_ACTIONS, Game } from "../js/game.js";
import {
  DEFAULT_PERFORMANCE_TIMING,
  PERFORMANCE_PHASES,
  PerformanceController,
  createNpcPerformance,
  getPortraitCue
} from "../js/performance.js";
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

function instantController() {
  return new PerformanceController({ wait: async () => {} });
}

test("NPC performance maps authored turn data to deterministic renderer metadata", () => {
  const performance = createNpcPerformance({
    action: "BECOME_SUSPICIOUS",
    tone: "irritated",
    line: "That is not what you said before.",
    status: "active"
  });

  assert.deepEqual(performance, {
    action: "BECOME_SUSPICIOUS",
    tone: "irritated",
    line: "That is not what you said before.",
    portraitCue: "suspicious",
    speech: {
      rate: 1.03,
      pitch: 0.7,
      preDelayMs: 35,
      audioPreset: "clipped-intercom"
    },
    timing: DEFAULT_PERFORMANCE_TIMING,
    terminal: false,
    outcome: "active"
  });
  assert.equal(getPortraitCue("ALLOW_ENTRY", "hostile"), "entry-granted");
  assert.equal(getPortraitCue("ANSWER_QUESTION", "friendly"), "friendly");
});

test("performance lifecycle follows the explicit Phase 9 sequence", async () => {
  const controller = instantController();
  const phases = [];
  controller.subscribe(({ phase }) => phases.push(phase));
  const performance = createNpcPerformance({
    action: "ANSWER_QUESTION",
    tone: "neutral",
    line: "Arthur. Night security.",
    timing: { reactionInMs: 1, speakingMs: 1, reactionOutMs: 1 }
  });

  controller.setPlayerTyping(true);
  controller.beginDecision();
  const result = await controller.play(performance);

  assert.deepEqual(phases, [
    PERFORMANCE_PHASES.PLAYER_TYPING,
    PERFORMANCE_PHASES.DECIDING,
    PERFORMANCE_PHASES.REACTION_IN,
    PERFORMANCE_PHASES.SPEAKING,
    PERFORMANCE_PHASES.REACTION_OUT,
    PERFORMANCE_PHASES.AWAITING_PLAYER
  ]);
  assert.deepEqual(result, {
    completed: true,
    skipped: false,
    cancelled: false,
    error: null
  });
});

test("skip completes the active performance without replaying the committed turn", async () => {
  const provider = async () => ({
    action: "ASK_FOR_REASON",
    confidence: 1,
    reason: "The player has not stated a purpose.",
    stateChanges: { trust: 7 },
    memory: null
  });
  const game = new Game({ npcTemplate, dialogueData, provider });
  const turn = await game.takeTurn("Please explain the access rules for tonight.");
  const committedSnapshot = game.getSnapshot();
  const controller = new PerformanceController({
    wait: () => new Promise(() => {})
  });

  controller.beginDecision();
  const playback = controller.play(turn.npcPerformance);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.phase, PERFORMANCE_PHASES.REACTION_IN);
  assert.equal(controller.skip(), true);

  const result = await playback;
  assert.equal(result.skipped, true);
  assert.equal(controller.phase, PERFORMANCE_PHASES.AWAITING_PLAYER);
  assert.deepEqual(game.getSnapshot(), committedSnapshot);
  assert.equal(game.turn, 1);
});

test("presentation failure reaches a safe phase and leaves game state applied once", async () => {
  const provider = async () => ({
    action: "WARN_PLAYER",
    confidence: 1,
    reason: "A warning is appropriate.",
    stateChanges: { irritation: 9 },
    memory: null
  });
  const game = new Game({ npcTemplate, dialogueData, provider });
  const turn = await game.takeTurn("You should step away from that door right now.");
  const committedSnapshot = game.getSnapshot();
  const controller = new PerformanceController({
    wait: async (_duration, phase) => {
      if (phase === PERFORMANCE_PHASES.SPEAKING) throw new Error("Animation failed.");
    }
  });

  controller.beginDecision();
  const result = await controller.play({
    ...turn.npcPerformance,
    timing: { reactionInMs: 1, speakingMs: 1, reactionOutMs: 1 }
  });

  assert.equal(result.completed, false);
  assert.match(result.error.message, /Animation failed/);
  assert.equal(controller.phase, PERFORMANCE_PHASES.AWAITING_PLAYER);
  assert.deepEqual(game.getSnapshot(), committedSnapshot);
  assert.equal(game.turn, 1);
});

test("rendering-disabled and lifecycle-driven scenarios keep identical simulation results", async () => {
  const withoutRenderer = new Game({
    npcTemplate,
    dialogueData,
    provider: chooseNpcAction,
    random: () => 0
  });
  const withLifecycle = new Game({
    npcTemplate,
    dialogueData,
    provider: chooseNpcAction,
    random: () => 0
  });
  const controller = instantController();
  const inputs = [
    "I'm from head office and need access, please.",
    "Here is my work ID badge and authorisation letter."
  ];

  for (const input of inputs) {
    const baselineTurn = await withoutRenderer.takeTurn(input);
    const presentedTurn = await withLifecycle.takeTurn(input);
    controller.beginDecision();
    await controller.play(presentedTurn.npcPerformance);

    assert.deepEqual(presentedTurn, baselineTurn);
    assert.deepEqual(withLifecycle.getSnapshot(), withoutRenderer.getSnapshot());
  }

  assert.equal(withLifecycle.status, "success");
  assert.equal(controller.phase, PERFORMANCE_PHASES.ENDING);
});
