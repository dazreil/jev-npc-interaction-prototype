// The templates (scripts/new-thing.mjs) make a character, scene, and item
// that the vault engine can use at once: notes, a canvas of art recipes, and
// a character you can talk to offline through the vault Mock.
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { readRecipes } from "../lib/asset-canvas.mjs";
import { buildCharacter } from "../js/engine/character-data.js";
import { Encounter } from "../js/engine/encounter.js";
import { chooseNpcAction as vaultMock } from "../js/providers/mock-vault.js";
import { compileVault } from "../scripts/compile-vault.mjs";
import { newThing } from "../scripts/new-thing.mjs";

const vault = await mkdtemp(join(tmpdir(), "vault-"));
after(() => rm(vault, { recursive: true, force: true }));
// The notes and canvases only; the art is not needed.
await cp(fileURLToPath(new URL("../game", import.meta.url)), vault, {
  recursive: true,
  filter: (source) => !/\/(art|assets|\.obsidian)(\/|$)/.test(source)
});

test("a new character has notes, a canvas of art recipes, and talks through the vault Mock", async () => {
  const { canvas } = await newThing("character", "Mira", "a tired night nurse in her 50s, short grey hair, blue scrubs", vault);
  assert.equal(canvas, "characters/mira/Mira.canvas");
  const compiled = await compileVault(vault);
  const mira = buildCharacter(compiled, "Mira");
  assert.deepEqual(mira.actions.map((action) => action.id), ["MIRA_ANSWER_QUESTION", "MIRA_ASK_FOR_REASON", "MIRA_REFUSE_REQUEST", "MIRA_END_CONVERSATION"]);
  assert.ok(mira.hasMockRules);
  assert.ok(compiled.trees["mira-tree.canvas"].start, "the tree has a start node");
  assert.deepEqual(compiled.errors.filter((error) => /mira/i.test(error)), [], "no broken links in Mira's notes");

  const recipes = readRecipes(JSON.parse(await readFile(join(vault, canvas), "utf8")));
  const names = recipes.map((recipe) => recipe.name);
  for (const name of ["mira-room", "mira-actor", "mira-friendly", "mira-blink-closed", "mira-talk", "mira-hostile-talk", "mira-booth"]) assert.ok(names.includes(name), name);
  assert.ok(recipes.every((recipe) => recipe.kind === "style" || recipe.fields.status === "idea"), "nothing runs until you say so");
  assert.equal(recipes.find((recipe) => recipe.name === "mira-friendly").references.length, 1, "moods edit the actor");
  assert.equal(recipes.find((recipe) => recipe.name === "mira-booth").actors.length, 1 + 7 + 1 + 5, "the booth takes the actor, moods, and talking loops");

  const talk = new Encounter({ vault: compiled, characterId: "Mira", provider: vaultMock });
  assert.equal(talk.getOpeningDialogue(), "Hello, friend. What do you need?");
  const first = await talk.takeTurn("hi there");
  assert.equal(first.decision.action, "MIRA_ASK_FOR_REASON", "the default action");
  const second = await talk.takeTurn("what is this place?");
  assert.equal(second.decision.action, "MIRA_ANSWER_QUESTION");
  const third = await talk.takeTurn("forget it, goodbye");
  assert.equal(third.decision.action, "MIRA_END_CONVERSATION");
  assert.equal(talk.outcome, "mira-talk-over");
  assert.equal(talk.status, "failure");
});

test("a new scene gets a screen note, an art canvas, and a group on the world canvas", async () => {
  await newThing("scene", "Loading bay", "a dim loading bay at night, roller doors, pallets", vault);
  const compiled = await compileVault(vault);
  assert.equal(compiled.notes["loading-bay"].type, "screen");
  assert.ok(compiled.world["loading-bay"], "the world canvas has the new screen");
  const recipes = readRecipes(JSON.parse(await readFile(join(vault, "screens/loading-bay/loading-bay.canvas"), "utf8")));
  assert.deepEqual(recipes.filter((recipe) => recipe.kind !== "style").map((recipe) => recipe.name), ["loading-bay-background", "loading-bay-prop", "loading-bay-prop-cut"]);
});

test("a new item gets a note and an art canvas; names cannot clash", async () => {
  await newThing("item", "Torch", "a heavy black police torch", vault);
  const compiled = await compileVault(vault);
  assert.equal(compiled.notes.torch.type, "item");
  assert.deepEqual(compiled.notes.torch.props.effects, ["item torch shown"]);
  await assert.rejects(newThing("item", "Torch", "again", vault), /already exists/);
});
