import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { AVAILABLE_ACTIONS } from "../js/game.js";
import { lintDialogueData } from "../js/dialogue-lint.js";

test("the shipped dialogue file has valid actions, templates, slots, and branches", async () => {
  const dialogueData = JSON.parse(
    await readFile(new URL("../data/dialogue.json", import.meta.url), "utf8")
  );
  const result = lintDialogueData(dialogueData, AVAILABLE_ACTIONS);

  assert.deepEqual(result.errors, []);
  assert.equal(result.statistics.actionCount, AVAILABLE_ACTIONS.length);
  assert.ok(result.statistics.templateEntries >= 2);
  assert.ok(result.statistics.branchCount >= 3);
  assert.ok(result.statistics.possibleLines > result.statistics.authoredFragments);
});

test("the dialogue linter reports missing slots and invalid branch conditions", () => {
  const action = AVAILABLE_ACTIONS[0];
  const dialogueData = {
    opening: "Evening.",
    actions: Object.fromEntries(
      AVAILABLE_ACTIONS.map((availableAction) => [availableAction, { neutral: "Line." }])
    )
  };
  dialogueData.actions[action].neutral = {
    template: "Bring me {missing}.",
    slots: { unused: ["something"] },
    branches: [
      {
        when: { lastAction: "NOT_AN_ACTION" },
        template: "Try again."
      }
    ]
  };

  const result = lintDialogueData(dialogueData, AVAILABLE_ACTIONS);

  assert.ok(result.errors.some((error) => error.includes("missing slot {missing}")));
  assert.ok(result.errors.some((error) => error.includes("must name an available action")));
  assert.ok(result.warnings.some((warning) => warning.includes("unused slot unused")));
});

