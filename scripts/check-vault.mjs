// Vault checker (ENGINE_SPEC.md section 11). The vault is the source of the
// game, so this only reads it: it compiles every note, builds each character
// the way the engine does, runs every detector's match / miss tests, and
// writes the result to game/_reports/check.md for reading in Obsidian.
//
//   npm run vault:check
//   npm run vault:check -- --watch   check again after every save
import { watch } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildCharacter } from "../js/engine/character-data.js";
import { VAULT_DIR, compileVault } from "./compile-vault.mjs";

/** Checks the vault once, writes _reports/check.md, and returns the problems. */
async function check() {
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
  return problems;
}

const printProblems = (problems) => {
  console.log(problems.length ? `${problems.length} problem(s):` : "All clear.");
  for (const problem of problems) console.log(`  - ${problem}`);
};

if (!process.argv.includes("--watch")) {
  const problems = await check();
  printProblems(problems);
  if (problems.length) process.exitCode = 1;
} else {
  // Watch: check again a moment after each save (Obsidian writes a file in
  // steps). The report and Obsidian's own settings do not count as saves.
  printProblems(await check());
  console.log(`Watching ${VAULT_DIR} (Ctrl+C stops).`);
  let timer = null;
  let running = false;
  let again = false;
  const run = async () => {
    if (running) return void (again = true);
    running = true;
    try {
      const problems = await check();
      console.log(`\n[${new Date().toLocaleTimeString()}] checked`);
      printProblems(problems);
    } catch (error) {
      console.log(`\n[${new Date().toLocaleTimeString()}] the check failed: ${error.message}`);
    }
    running = false;
    if (again) {
      again = false;
      run();
    }
  };
  watch(VAULT_DIR, { recursive: true }, (_event, file) => {
    if (!file || file.startsWith(".obsidian") || file.startsWith("_reports") || /(^|\/)\./.test(file)) return;
    clearTimeout(timer);
    timer = setTimeout(run, 300);
  });
}
