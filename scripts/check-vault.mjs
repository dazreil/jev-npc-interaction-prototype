// Vault checker (ENGINE_SPEC.md section 11). The vault is the source of the
// game, so this only reads it: it compiles every note, builds each character
// the way the engine does, runs every detector's match / miss tests, and
// writes the result to game/_reports/check.md for reading in Obsidian.
//
//   npm run vault:check
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildCharacter } from "../js/engine/character-data.js";
import { VAULT_DIR, compileVault } from "./compile-vault.mjs";

const vault = await compileVault();
const problems = [...vault.errors];
const notes = Object.entries(vault.notes);
const ofType = (type) => notes.filter(([, note]) => note.type === type);

// Characters: everything the engine needs must be there.
const characters = [];
for (const [id] of ofType("character")) {
  try {
    const character = buildCharacter(vault, id);
    characters.push(character);
    for (const action of character.actions) {
      if (!character.dialogue.actions[action.id]?.neutral) problems.push(`[[${action.id}]] has no \`neutral\` lines`);
      if (!action.criteria) problems.push(`[[${action.id}]] has no \`## Criteria\` for the model`);
    }
    if (!character.actions.some((action) => action.id === character.fallbackAction)) {
      problems.push(`[[${id}]] fallbackAction \`${character.fallbackAction}\` is not one of its actions`);
    }
    if (character.tree && !vault.trees?.[character.tree]) problems.push(`[[${id}]] tree \`${character.tree}\` did not load`);
  } catch (error) {
    problems.push(`[[${id}]]: ${error.message}`);
  }
}

// Detectors: each match / miss list is a test.
let detectorTests = 0;
const detectorNote = ofType("detectors")[0]?.[1];
for (const [name, block] of Object.entries(detectorNote?.blocks ?? {})) {
  if (!block?.pattern) continue;
  let regex;
  try {
    regex = new RegExp(block.pattern, block.flags ?? "i");
  } catch (error) {
    problems.push(`detector \`${name}\`: bad pattern: ${error.message}`);
    continue;
  }
  const unless = block.unless ? new RegExp(detectorNote.blocks[block.unless]?.pattern ?? "$^", "i") : null;
  const hits = (text) => regex.test(text) && !(unless && unless.test(text));
  for (const text of block.match ?? []) {
    detectorTests += 1;
    if (!hits(text)) problems.push(`detector \`${name}\` should match: "${text}"`);
  }
  for (const text of block.miss ?? []) {
    detectorTests += 1;
    if (hits(text)) problems.push(`detector \`${name}\` should miss: "${text}"`);
  }
}

// Every outcome should be reachable from something.
const text = JSON.stringify(vault);
for (const [id] of ofType("outcome")) {
  if (!text.includes(`"end ${id}"`) && !text.includes(`"ends":"${id}"`)) problems.push(`[[${id}]] is never set by anything`);
}

const lineCount = characters.reduce(
  (count, character) => count + (JSON.stringify(character.dialogue).match(/"[^"]{12,}"/g) ?? []).length,
  0
);
const report = `# Check report

Written by \`npm run vault:check\`. Do not edit.

${problems.length ? `## ${problems.length} problem(s)\n${problems.map((problem) => `- ${problem}`).join("\n")}` : "## All clear\nEvery link points to a real note or asset. Every file name is unique. Every character builds. Every detector test passed."}

## Stats
| Thing | Count |
| --- | --- |
| Notes | ${notes.length} |
| Characters | ${characters.length} |
| Actions | ${characters.reduce((count, character) => count + character.actions.length, 0)} |
| Profiles | ${characters.reduce((count, character) => count + character.profileIds.length, 0)} |
| Authored lines (about) | ${lineCount} |
| Events | ${ofType("event").length} |
| Detector tests | ${detectorTests} |
`;
await mkdir(join(VAULT_DIR, "_reports"), { recursive: true });
await writeFile(join(VAULT_DIR, "_reports", "check.md"), report);
console.log(problems.length ? `${problems.length} problem(s):` : "All clear.");
for (const problem of problems) console.log(`  - ${problem}`);
if (problems.length) process.exitCode = 1;
