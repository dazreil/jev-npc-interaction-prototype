import { readFile } from "node:fs/promises";

import { AVAILABLE_ACTIONS } from "../js/game.js";
import { lintDialogueData } from "../js/dialogue-lint.js";

const dialogueData = JSON.parse(
  await readFile(new URL("../data/dialogue.json", import.meta.url), "utf8")
);
const result = lintDialogueData(dialogueData, AVAILABLE_ACTIONS);

for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
for (const error of result.errors) console.error(`Error: ${error}`);

const stats = result.statistics;
console.log(
  `Dialogue lint ${result.errors.length ? "failed" : "passed"}: ` +
    `${stats.actionCount} actions, ${stats.authoredFragments} authored fragments, ` +
    `${stats.templateEntries} template entries, ${stats.branchCount} branches, ` +
    `${stats.possibleLines} possible rendered lines.`
);

if (result.errors.length) process.exitCode = 1;

