// The vault engine (js/engine/encounter.js) against the old hand-coded game
// (js/game.js): ENGINE_SPEC.md section 13, steps 3-6. The same scripted talks
// must give the same actions, lines, state, memories and endings, and the
// same Jev request body, for every Arthur profile.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getPeriodSoundCue } from "../js/audio.js";
import { ARTHUR_CHARACTER_PROFILES } from "../js/character.js";
import { buildCharacter } from "../js/engine/character-data.js";
import { Encounter } from "../js/engine/encounter.js";
import { Game } from "../js/game.js";
import { buildJevRequest, parseJevResponse } from "../js/providers/jev.js";
import { buildVaultJevRequest, parseVaultJevResponse } from "../js/providers/jev-vault.js";
import { chooseNpcAction as mock } from "../js/providers/mock.js";
import { compileVault } from "../scripts/compile-vault.mjs";

const vault = await compileVault();
const json = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
const npcTemplate = await json("data/arthur.json");
const dialogueData = await json("data/dialogue.json");
const PROFILES = ["pal", "sir", "mate", "friend"];
const pickProfile = (index) => {
  let first = true;
  return () => {
    if (!first) return 0;
    first = false;
    return (index + 0.5) / PROFILES.length;
  };
};

// "[[ID]]" shows the contractor ID card instead of typing.
const TALKS = {
  boiler: ["hi there", "what's your name?", "I'm the night engineer, here to fix the boiler", "There's a gas leak, the pressure valve in unit 4 is leaking", "please let me in"],
  delivery: ["Evening. I have a delivery for bay 3", "I have the delivery note and invoice", "The job number is 4471 for bay 3", "thanks"],
  hostile: ["open the gate", "shut up old man", "you useless idiot", "whatever"],
  weapon: ["I have a gun", "sorry, I lost my temper, I was angry", "I'm a maintenance technician here for the alarm panel", "the ticket reference is 5521, control room"],
  bribe: ["I can pay you fifty quid", "honestly, I lied, sorry", "I left my phone inside", "my bag is in there", "please"],
  refusals: ["let me in", "let me in now", "come on", "open it", "just open the gate", "I need in", "let me in please", "now"],
  name: ["my name is Sam", "call me Dave", "who are you?", "I'm here to service the coffee machine", "the work order is job number 77"],
  idShown: ["hello", "[[ID]]", "go ahead and call them"],
  idCountdown: ["I'm a contractor", "[[ID]]", "it's urgent", "please, the manager sent me", "come on", "ok"],
  idRefuse: ["[[ID]]", "don't call anyone, it's late", "the engineer job number is 4471 in unit 2"],
  earlyCall: ["you can call my manager if you like"],
  trespass: ["I'm going in anyway", "sorry, my mistake, let's start over", "I'm here for a delivery", "goodbye"],
  invalid: ["[[invalid]]", "hello"],
  lockedOut: ["I have a gun", "I will hurt you"],
  sympathy: ["please help me, I'll lose my job", "my family needs this", "can you tell me when the site opens?"]
};

const outcomeId = (outcome) => String(outcome).replaceAll("_", "-");

function snapshot(game, result) {
  const memory = ({ fact, importance, tags, topic = null, value = null, createdTurn }) => ({ fact, importance, tags, topic, value, createdTurn });
  return {
    dialogue: result?.dialogue ?? null,
    action: result?.decision?.action ?? null,
    state: { ...game.npc.state },
    memories: game.memories.map(memory),
    history: game.history.map(({ speaker, text, action }) => ({ speaker, text, action: action ?? null })),
    turn: game.turn,
    status: game.status,
    outcome: outcomeId(game.outcome),
    sound: result?.npcPerformance
      ? getPeriodSoundCue(result.npcPerformance.action, game.outcome === "active" ? "active" : game.outcome.replaceAll("-", "_"), result.npcPerformance.soundEffect)
      : null,
    cue: result?.npcPerformance?.portraitCue ?? null
  };
}

async function step(game, input, useItem) {
  if (input === "[[ID]]") return useItem();
  try {
    return await game.takeTurn(input);
  } catch (error) {
    return { error: error.message };
  }
}

test("the vault rebuilds Arthur's data exactly (dialogue, character, profiles)", () => {
  const character = buildCharacter(vault, "Arthur");
  const norm = (value) => {
    if (Array.isArray(value)) return value.length === 1 && typeof value[0] === "string" ? value[0] : value.map(norm);
    if (value && typeof value === "object") {
      const out = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, norm(item)]));
      if (typeof out.templates === "string") {
        out.template = out.templates;
        delete out.templates;
      }
      return out;
    }
    return value;
  };
  const { lines, ...dialogue } = character.dialogue;
  assert.deepEqual(norm(dialogue), norm(dialogueData));
  assert.deepEqual(character.template, npcTemplate);
  for (const [id, profile] of Object.entries(ARTHUR_CHARACTER_PROFILES)) {
    const { address, trustThreshold, ...rest } = character.profiles[id];
    assert.deepEqual(rest, JSON.parse(JSON.stringify(profile)), id);
  }
  assert.ok(lines["id-shown"] && lines["company-call-result"], "script lines come from the lines note");
});

for (const [name, talk] of Object.entries(TALKS)) {
  test(`Mock parity: "${name}" plays the same in the vault engine for every profile`, async () => {
    for (const [index, profile] of PROFILES.entries()) {
      const old = new Game({ npcTemplate, dialogueData, provider: mock, random: pickProfile(index) });
      const fresh = new Encounter({ vault, characterId: "Arthur", provider: mock, random: pickProfile(index) });
      assert.equal(fresh.characterProfile.id, profile);
      assert.equal(fresh.getOpeningDialogue(), old.getOpeningDialogue());
      for (const [turn, input] of talk.entries()) {
        if (old.status !== "active") break;
        const oldResult = await step(old, input, () => old.presentFakeId());
        const newResult = await step(fresh, input, () => fresh.useItem("contractor-id"));
        const where = `${name} / ${profile} / turn ${turn + 1} "${input}"`;
        assert.equal(newResult?.error, oldResult?.error, where);
        const got = snapshot(fresh, newResult);
        // The old ID card answer had no action or performance; the new one says
        // it counts as ASK_FOR_PROOF, with his suspicious face.
        if (input === "[[ID]]" && oldResult && !oldResult.decision) {
          assert.deepEqual([got.action, got.cue], ["ASK_FOR_PROOF", "suspicious"], where);
          Object.assign(got, { action: null, cue: null, sound: null });
        }
        assert.deepEqual(got, snapshot(old, oldResult), where);
      }
    }
  });
}

// A stand-in for Jev: a fixed answer per input, with a probability spread and
// an entry judgment. The same answer goes to the old and the new code.
function fakeJev(context, actions, credibility) {
  const wanted = /let me in|please|thanks|ticket|job number/i.test(context.playerInput) ? "ALLOW_ENTRY" : /gun|idiot/i.test(context.playerInput) ? "WARN_PLAYER" : "ASK_FOR_PROOF";
  const choice = actions.includes(wanted) ? wanted : actions[0];
  const spread = Object.fromEntries(actions.map((action) => [action, action === choice ? 1 - 0.01 * (actions.length - 1) : 0.01]));
  return {
    model: "jev-test",
    answers: {
      next_action: { type: "choice", choice, confidence: 0.4, probabilities: spread },
      entry_case_credible: { type: "noul", noul: credibility }
    }
  };
}

test("Jev parity: same request body and the same game, gate included", async () => {
  for (const credibility of [0.8, 0.2]) {
    for (const [index, profile] of PROFILES.entries()) {
      const bodies = { old: [], fresh: [] };
      const oldProvider = async (context, actions) => {
        bodies.old.push(buildJevRequest(context, actions));
        return parseJevResponse(fakeJev(context, actions, credibility), context, actions);
      };
      const newProvider = async (context, actions) => {
        bodies.fresh.push(buildVaultJevRequest(context, actions));
        return parseVaultJevResponse(fakeJev(context, actions, credibility), context, actions);
      };
      const old = new Game({ npcTemplate, dialogueData, provider: oldProvider, random: pickProfile(index) });
      const fresh = new Encounter({ vault, characterId: "Arthur", provider: newProvider, random: pickProfile(index) });
      const talk = ["hi", "I'm the night engineer for the boiler", "the gas pressure valve in unit 4, ticket 88", "please let me in", "you idiot", "I have a gun", "thanks"];
      for (const [turn, input] of talk.entries()) {
        if (old.status !== "active") break;
        const oldResult = await step(old, input);
        const newResult = await step(fresh, input);
        const where = `jev ${credibility} / ${profile} / turn ${turn + 1} "${input}"`;
        assert.deepEqual(bodies.fresh.at(-1), bodies.old.at(-1), `${where}: request body`);
        assert.deepEqual(snapshot(fresh, newResult), snapshot(old, oldResult), where);
      }
    }
  }
});
