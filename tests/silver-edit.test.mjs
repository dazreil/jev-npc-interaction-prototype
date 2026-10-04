// The Silver Edit slice (silver-edit/): several characters in one game, each
// with their own moods, talked to face to face, and a dream with choices.
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildCharacter } from "../js/engine/character-data.js";
import { Encounter } from "../js/engine/encounter.js";
import { PlaySession } from "../js/engine/session.js";
import { chooseNpcAction as vaultMock } from "../js/providers/mock-vault.js";
import { compileVault } from "../scripts/compile-vault.mjs";

const vault = await compileVault(fileURLToPath(new URL("../silver-edit", import.meta.url)));
const talk = async (encounter, lines) => {
  const results = [];
  for (const line of lines) results.push(await encounter.takeTurn(line));
  return results;
};

test("the Silver Edit vault compiles cleanly, with four characters and their own moods", () => {
  assert.deepEqual(vault.errors, []);
  assert.deepEqual(Object.keys(vault.world), ["office", "home", "dream"]);
  const arthur = buildCharacter(vault, "Arthur");
  assert.deepEqual(arthur.stateKeys, ["trust", "warmth", "irritation"]);
  assert.deepEqual(buildCharacter(vault, "Malphas").template.state, { temptation: 30, patience: 60 });
  for (const id of ["Arthur", "Miles", "Chloe", "Malphas"]) assert.ok(buildCharacter(vault, id).hasMockRules, id);
});

test("Arthur opens up only once trust and warmth are earned; his goodbye ends the talk, not the game", async () => {
  const arthur = new Encounter({ vault, characterId: "Arthur", provider: vaultMock });
  const early = await arthur.takeTurn("Were you married, Mr. Thorne?");
  assert.equal(early.decision.action, "ARTHUR_DEFLECT", "too soon");
  const results = await talk(arthur, [
    "Thank you, it is lovely to meet you.",
    "How is the Harrow manuscript coming along?",
    "Thanks, that is kind of you to say.",
    "I think the second act of the manuscript drags.",
    "Thank you for the tea, truly.",
    "Were you married, Mr. Thorne? You seem to carry a loss."
  ]);
  assert.equal(results.at(-1).decision.action, "ARTHUR_OPEN_UP");
  assert.match(results.at(-1).dialogue, /Margaret/);
  assert.ok(arthur.memories.some((memory) => memory.tags.includes("clue")));
  const bye = await arthur.takeTurn("I'll let you get back to it.");
  assert.equal(bye.decision.action, "ARTHUR_DISMISS");
  assert.equal(arthur.outcome, "arthur-day-done");
  assert.equal(vault.notes["arthur-day-done"].props.endsGame, false);
});

test("in the dream, refusing Malphas wears down his patience until Elena can wake", async () => {
  const malphas = new Encounter({ vault, characterId: "Malphas", provider: vaultMock });
  assert.deepEqual(malphas.choices().map((choice) => choice.text), ["Rest. Just for a moment."], "Wake up. is hidden at first");
  await talk(malphas, ["No. Leave me alone.", "I won't come back to you."]);
  assert.ok(malphas.npc.state.patience <= 40);
  assert.ok(malphas.choices().some((choice) => choice.text === "Wake up."), "Wake up. appears");
  const woke = malphas.choose("Wake up.");
  assert.equal(woke.outcome, "dream-resisted");
  assert.equal(woke.dialogue, null, "the waking is narrated, not said by Malphas");
  assert.match(woke.narration, /wakes/);
  assert.equal(malphas.status, "success");

  const lost = new Encounter({ vault, characterId: "Malphas", provider: vaultMock });
  const rest = lost.choose("Rest. Just for a moment.");
  assert.equal(rest.outcome, "dream-yielded");
  assert.match(rest.dialogue, /rest/i);
});

test("a play session talks to several people, each with their own chat, face to face", async () => {
  const session = new PlaySession({ vault, providers: { mock: vaultMock } });
  session.start();
  assert.equal(session.world.screen, "office");
  session.runEffects(["open arthur-door"]);
  assert.equal(session.active, "Arthur");
  assert.equal(session.world.call.live, true, "no ringing in the same room");
  // His first-day scene plays: through its lines and its choice, to free talk.
  assert.equal(session.scene?.scene.id, "arthur-first-day");
  for (let guard = 0; guard < 10 && session.sceneStep?.type !== "talk"; guard += 1) {
    if (session.sceneStep.type === "choice") session.chooseInScene(0);
    else session.continueScene();
  }
  assert.ok(session.chats.Arthur.some((line) => /Harrow manuscript/.test(line.text)), "the scene's lines are in the talk");
  assert.equal(session.game.npc.state.trust, 28, "the first option raised his trust by 8");
  const before = session.chats.Arthur.length;
  session.draft = "How is the Harrow manuscript coming along?";
  await session.send();
  assert.equal(session.chats.Arthur.length, before + 2, "free talk: her line and his answer");

  session.runEffects(["close"]);
  assert.deepEqual(session.world.open, {}, "close alone closes whatever is open");
  session.runEffects(["open miles-desk"]);
  assert.equal(session.active, "Miles");
  assert.equal(session.world.speaker, "Miles Parker");
  assert.equal(session.scene?.scene.id, "miles-first-day");
  assert.equal(session.chats.Arthur.length, before + 2, "Arthur's talk is kept");
  assert.equal(session.world.talk.arthur, "active");
  session.paused = true;
  clearInterval(session.timerId);
});

test("a scene plays in the game: Continue, choices that change a mood, free talk, then it closes", async () => {
  const scened = structuredClone(vault);
  scened.story = {
    "chloe-sketch": {
      id: "chloe-sketch",
      with: "Chloe",
      events: [
        { id: "a", type: "line", mood: "uneasy", text: "Can I show you something weird?" },
        { id: "b", type: "choice", options: [{ id: "b1", text: "Show me.", events: [{ id: "b1a", type: "set", effect: "state unease +30" }, { id: "b1b", type: "line", text: "Okay. Don't laugh." }] }] },
        { id: "c", type: "talk", until: "flag.saw-sketch" },
        { id: "d", type: "narrate", text: "She puts the notebook away." },
        { id: "e", type: "end" }
      ]
    }
  };
  scened.notes["chloe-desk"] = structuredClone(scened.notes["chloe-desk"]);
  scened.notes["chloe-desk"].props.scene = "chloe-sketch";
  const session = new PlaySession({ vault: scened, providers: { mock: vaultMock } });
  session.start();
  session.runEffects(["open chloe-desk"]);
  assert.equal(session.active, "Chloe");
  assert.deepEqual(session.chats.Chloe.map((line) => line.text), ["Can I show you something weird?"], "the scene replaces her greeting");
  assert.equal(session.sceneHolds, true, "typing waits while a line shows");
  const unease = session.game.npc.state.unease;
  session.continueScene();
  assert.equal(session.sceneStep.type, "choice");
  session.chooseInScene(0);
  assert.equal(session.game.npc.state.unease, unease + 30, "the choice's set block changed her mood");
  assert.equal(session.chats.Chloe.at(-1).text, "Okay. Don't laugh.");
  session.continueScene();
  assert.equal(session.sceneStep.type, "talk");
  assert.equal(session.sceneHolds, false, "free talk: she can type");
  session.game.flag["saw-sketch"] = true;
  session.draft = "That is a beautiful drawing.";
  await session.send();
  assert.equal(session.chats.Chloe.at(-1).text, "She puts the notebook away.", "the talk's condition held, so the scene went on");
  session.continueScene();
  assert.equal(session.scene, null);
  assert.deepEqual(session.world.open, {}, "the end closed the talk");
  session.runEffects(["open chloe-desk"]);
  assert.equal(session.scene, null, "a scene plays once; after that she talks freely");
  session.paused = true;
  clearInterval(session.timerId);
});

test("between lines, a character rests on the face of their mood (restOnMood), and any mood is its own cue", async () => {
  const { getPortraitCue } = await import("../js/performance.js");
  assert.equal(getPortraitCue("SCENE", "uneasy"), "uneasy", "a character's own mood becomes the cue");
  assert.equal(getPortraitCue("SCENE", "friendly"), "friendly");
  const session = new PlaySession({ vault, providers: { mock: vaultMock } });
  session.start();
  session.active = "Chloe";
  session.mood = "excited";
  assert.match(session.restingFrame(), /chloe-excited-face-cut\.webp$/);
  session.mood = "angry";
  assert.match(session.restingFrame(), /chloe-talk-cut-08\.webp$/, "a mood with no face rests on the idle frame");
  session.paused = true;
  clearInterval(session.timerId);
});
