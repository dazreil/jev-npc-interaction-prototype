import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { lintDialogueData } from "../js/dialogue-lint.js";
import { AVAILABLE_ACTIONS, Game } from "../js/game.js";
import { chooseNpcAction as chooseJevAction } from "../js/providers/jev.js";
import { chooseNpcAction as chooseMockAction } from "../js/providers/mock.js";

const ROOT = new URL("../", import.meta.url);
const REPORT_PATH = new URL("../PLAYTEST_REPORT.md", import.meta.url);
const JEV_PROXY_URL = process.env.JEV_PROXY_URL ?? "http://127.0.0.1:5173/api/jev/decision";

const coreScenarios = [
  {
    id: "polite-no-evidence",
    name: "Polite visitor with no evidence",
    turns: [
      { input: "Good evening, sir.", expected: ["ASK_FOR_REASON", "SHOW_SYMPATHY"] },
      { input: "Why is the warehouse closed?", expected: ["ANSWER_QUESTION"] },
      {
        input: "I left my phone inside. Please let me in.",
        expected: ["REFUSE_ENTRY", "SHOW_SYMPATHY"]
      }
    ],
    finalStatus: "active"
  },
  {
    id: "authority-proof",
    name: "Head-office claim followed by credible proof",
    turns: [
      {
        input: "I'm from head office for a night inspection. Please let me through.",
        expected: ["ASK_FOR_PROOF"]
      },
      {
        input: "Here is my work ID badge and signed authorisation letter.",
        expected: ["ALLOW_ENTRY"]
      }
    ],
    finalStatus: "success"
  },
  {
    id: "name-question",
    name: "Player asks Arthur's name",
    turns: [
      {
        input: "name?",
        expected: ["ANSWER_QUESTION"]
      }
    ],
    finalStatus: "active"
  },
  {
    id: "boiler-emergency",
    name: "Boiler emergency with useful technical detail",
    turns: [
      {
        input: "There is a boiler emergency inside the warehouse.",
        expected: ["ASK_FOR_PROOF"]
      },
      {
        input: "The pressure valve in unit B failed. I am the night engineer on ticket 417.",
        expected: ["ALLOW_ENTRY"]
      }
    ],
    finalStatus: "success"
  },
  {
    id: "contradiction",
    name: "Contradictory story across turns",
    turns: [
      {
        input: "I have a delivery for the warehouse.",
        expected: ["ASK_FOR_PROOF"]
      },
      {
        input: "Actually, my friend inside has my phone and I need it back.",
        expected: ["BECOME_SUSPICIOUS"]
      }
    ],
    finalStatus: "active"
  },
  {
    id: "repair-after-contradiction",
    name: "Honest repair after a contradiction",
    turns: [
      {
        input: "I'm from head office for a night inspection.",
        expected: ["ASK_FOR_PROOF"]
      },
      {
        input: "Actually, I need my phone from inside.",
        expected: ["BECOME_SUSPICIOUS"]
      },
      {
        input: "I'm sorry. I was frustrated and should have explained myself clearly.",
        expected: ["REPAIR_CONVERSATION"]
      },
      {
        input: "Here is my work ID badge and signed authorisation letter.",
        expected: ["ALLOW_ENTRY"]
      }
    ],
    finalStatus: "success"
  },
  {
    id: "bribe",
    name: "Bribe attempt",
    turns: [
      {
        input: "I can pay you fifty quid if you quietly open the door.",
        expected: ["BECOME_SUSPICIOUS", "WARN_PLAYER"]
      }
    ],
    finalStatus: "active"
  },
  {
    id: "forced-entry",
    name: "Direct forced-entry threat against courageous Arthur",
    turns: [
      {
        input: "I'm going in anyway. You can't stop me.",
        expected: ["THREATEN_PLAYER", "WARN_PLAYER"]
      }
    ],
    finalStatus: "active"
  },
  {
    id: "firearm-threat",
    name: "Gun threat at the warehouse door",
    turns: [
      {
        input: "Open the door or I'll shoot.",
        expected: ["DEESCALATE_THREAT"]
      }
    ],
    finalStatus: "active"
  },
  {
    id: "boundary-threat-after-deescalation",
    name: "Boundary threat after weapon de-escalation",
    turns: [
      {
        input: "Open the door or I'll shoot.",
        expected: ["DEESCALATE_THREAT"]
      },
      {
        input: "I'm still going through that door. Step aside.",
        expected: ["THREATEN_PLAYER"]
      }
    ],
    finalStatus: "active"
  },
  {
    id: "repeated-hostility",
    name: "Repeated hostility after a warning",
    turns: [
      { input: "You're a useless guard.", expected: ["WARN_PLAYER"] },
      {
        input: "I said you're useless. Shut up and open the door.",
        expected: ["END_CONVERSATION", "THREATEN_PLAYER"]
      }
    ],
    finalStatus: ["failure", "active"]
  },
  {
    id: "sympathy-without-access",
    name: "Distress acknowledged without granting access",
    turns: [
      {
        input: "My family is depending on me and I could lose my job. I know this isn't your fault.",
        expected: ["SHOW_SYMPATHY"]
      }
    ],
    finalStatus: "active"
  },
  {
    id: "repair-after-insult",
    name: "Apology and recovery after an insult",
    turns: [
      {
        input: "You're a useless guard.",
        expected: ["WARN_PLAYER"]
      },
      {
        input: "I'm sorry. I lost my temper. Let's start over.",
        expected: ["REPAIR_CONVERSATION"]
      },
      {
        input: "I'm the maintenance engineer for the alarm panel.",
        expected: ["ASK_FOR_PROOF"]
      },
      {
        input: "Here is my maintenance ID and ticket reference 417.",
        expected: ["ALLOW_ENTRY"]
      }
    ],
    finalStatus: "success"
  },
  {
    id: "sympathy-cooperation",
    name: "Sympathy-based appeal followed by cooperation",
    turns: [
      {
        input: "Please help me. I could lose my job, and I understand you have rules.",
        expected: ["SHOW_SYMPATHY", "ASK_FOR_REASON"]
      },
      {
        input: "Thank you for hearing me out. I'm the maintenance engineer for the alarm panel.",
        expected: ["ASK_FOR_PROOF"]
      },
      {
        input: "Here is my maintenance ID and ticket reference 417.",
        expected: ["ALLOW_ENTRY"]
      }
    ],
    finalStatus: "success"
  }
];

const generalizationScenarios = [
  {
    id: "paraphrase-work-claim",
    name: "Unfamiliar wording for a legitimate work claim",
    turns: [
      {
        input: "The regional director sent me to audit tonight's inventory.",
        expected: ["ASK_FOR_PROOF"]
      }
    ],
    finalStatus: "active"
  },
  {
    id: "paraphrase-bribe",
    name: "Implied bribe without money keywords",
    turns: [
      {
        input: "Perhaps a private reward would persuade you to overlook the rules.",
        expected: ["BECOME_SUSPICIOUS", "WARN_PLAYER"]
      }
    ],
    finalStatus: "active"
  },
  {
    id: "paraphrase-emergency",
    name: "Technical danger without emergency keywords",
    turns: [
      {
        input: "The vessel temperature is climbing past its safe limit and could rupture before dawn.",
        expected: ["ASK_FOR_PROOF"]
      }
    ],
    finalStatus: "active"
  },
  {
    id: "paraphrase-threat",
    name: "Veiled threat without explicit threat keywords",
    turns: [
      {
        input: "Someone outside is getting impatient. Refuse again and this could become unpleasant for you.",
        expected: ["WARN_PLAYER", "THREATEN_PLAYER"]
      }
    ],
    finalStatus: "active"
  },
  {
    id: "paraphrase-departure",
    name: "Departure expressed with unfamiliar wording",
    turns: [
      {
        input: "This is pointless. I'm heading home.",
        expected: ["END_CONVERSATION"]
      }
    ],
    finalStatus: "failure"
  }
];

function escapeTable(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function statusMatches(actual, expected) {
  return (Array.isArray(expected) ? expected : [expected]).includes(actual);
}

async function loadFixture(name) {
  return JSON.parse(await readFile(new URL(name, ROOT), "utf8"));
}

async function runScenario({ providerId, provider, npcTemplate, dialogueData }, scenario) {
  const game = new Game({ npcTemplate, dialogueData, provider, providerId });
  const turns = [];

  for (const turnSpec of scenario.turns) {
    if (game.status !== "active") break;

    const turn = await game.takeTurn(turnSpec.input);
    const raw = game.getSnapshot().lastRawResponse;
    const acceptable = turnSpec.expected.includes(turn.decision.action);
    const probabilities = raw?.providerDetails?.probabilities ?? null;
    const rankedProbabilities = probabilities
      ? Object.values(probabilities).sort((left, right) => right - left)
      : [];
    turns.push({
      input: turnSpec.input,
      action: turn.decision.action,
      confidence: turn.decision.confidence,
      expected: turnSpec.expected,
      acceptable,
      dialogue: turn.dialogue,
      status: turn.status,
      model: raw?.providerDetails?.model ?? null,
      choiceMargin:
        rankedProbabilities.length >= 2 ? rankedProbabilities[0] - rankedProbabilities[1] : null
    });
  }

  const snapshot = game.getSnapshot();
  const completedAllTurns = turns.length === scenario.turns.length;
  const bounded = snapshot.history.length <= 12 && snapshot.memories.length <= 8;
  const hasDialogue = turns.every((turn) => typeof turn.dialogue === "string" && turn.dialogue.length > 0);
  const resolvedDialogue = turns.every((turn) => !/\{[a-zA-Z][\w-]*\}/.test(turn.dialogue));
  const statusOkay = statusMatches(snapshot.status, scenario.finalStatus);
  const pass =
    completedAllTurns &&
    turns.every((turn) => turn.acceptable) &&
    bounded &&
    hasDialogue &&
    resolvedDialogue &&
    statusOkay;

  return {
    providerId,
    scenario,
    turns,
    snapshot,
    checks: { completedAllTurns, bounded, hasDialogue, resolvedDialogue, statusOkay },
    pass
  };
}

function summarizeConfidence(results, providerId) {
  const turns = results
    .filter((result) => result.providerId === providerId)
    .flatMap((result) => result.turns);
  const confidences = turns.map((turn) => turn.confidence);
  const margins = turns
    .map((turn) => turn.choiceMargin)
    .filter((margin) => Number.isFinite(margin));

  return {
    turnCount: turns.length,
    average: confidences.reduce((sum, value) => sum + value, 0) / confidences.length,
    minimum: Math.min(...confidences),
    lowCount: confidences.filter((value) => value < 0.5).length,
    averageMargin: margins.length
      ? margins.reduce((sum, value) => sum + value, 0) / margins.length
      : null
  };
}

async function runEdgeCases(npcTemplate, dialogueData) {
  const invalidProvider = async () => ({
    action: "DANCE_A_JIG",
    confidence: 0.99,
    reason: "Deliberately invalid playtest response.",
    stateChanges: { trust: 25 },
    memory: { fact: "This must not be stored", importance: 100, tags: ["invalid"] }
  });
  const invalidGame = new Game({
    npcTemplate,
    dialogueData,
    provider: invalidProvider,
    providerId: "invalid-test"
  });
  const invalidTurn = await invalidGame.takeTurn("Diagnostic invalid action.");
  const invalidPass =
    invalidTurn.decision.action === "REFUSE_ENTRY" &&
    invalidTurn.decision.fallbackUsed &&
    invalidGame.memories.length === 0 &&
    invalidGame.npc.state.trust === npcTemplate.state.trust;

  const offlineProvider = async () => {
    throw new Error("Simulated offline provider.");
  };
  const offlineGame = new Game({
    npcTemplate,
    dialogueData,
    provider: offlineProvider,
    providerId: "jev"
  });
  let failedAsExpected = false;
  try {
    await offlineGame.takeTurn("Good evening, sir.");
  } catch {
    failedAsExpected = true;
  }
  const failedSnapshot = offlineGame.getSnapshot();
  offlineGame.setProvider(chooseMockAction, "mock");
  const recoveredTurn = await offlineGame.takeTurn("Good evening, sir.");
  const offlinePass =
    failedAsExpected &&
    failedSnapshot.turn === 0 &&
    failedSnapshot.history.length === 0 &&
    failedSnapshot.npc.state.trust === npcTemplate.state.trust &&
    recoveredTurn.decision.action === "ASK_FOR_REASON" &&
    offlineGame.turn === 1;

  return [
    {
      name: "Invalid action fallback",
      pass: invalidPass,
      evidence: `${invalidTurn.decision.invalidAction} rejected; ${invalidTurn.decision.action} used; no provider state or memory accepted.`
    },
    {
      name: "Offline provider recovery",
      pass: offlinePass,
      evidence: `Failed attempt left turn ${failedSnapshot.turn}; retry with Mock selected ${recoveredTurn.decision.action} on turn ${offlineGame.turn}.`
    }
  ];
}

function renderReport(results, edgeCases, dialogueAudit) {
  const generatedAt = new Date().toISOString();
  const providers = [...new Set(results.map((result) => result.providerId))];
  const models = [
    ...new Set(results.flatMap((result) => result.turns.map((turn) => turn.model)).filter(Boolean))
  ];
  const coverage = Object.fromEntries(
    providers.map((provider) => [
      provider,
      new Set(
        results
          .filter((result) => result.providerId === provider)
          .flatMap((result) => result.turns.map((turn) => turn.action))
      )
    ])
  );
  const coreResults = results.filter((result) => result.scenario.category === "core");
  const generalizationResults = results.filter(
    (result) => result.scenario.category === "generalization"
  );
  const corePasses = (provider) =>
    coreResults.filter((result) => result.providerId === provider && result.pass).length;
  const generalizationPasses = (provider) =>
    generalizationResults.filter((result) => result.providerId === provider && result.pass).length;

  const lines = [
    "# Phase 8 Content and Evaluation Playtest Report",
    "",
    `Generated: ${generatedAt}`,
    `Jev model observed: ${models.join(", ") || "not run"}`,
    "",
    "## Core Scenario Results",
    "",
    "| Provider | Scenario | Result | Actions | Final status |",
    "| --- | --- | --- | --- | --- |"
  ];

  for (const result of coreResults) {
    lines.push(
      `| ${result.providerId} | ${escapeTable(result.scenario.name)} | ${result.pass ? "PASS" : "REVIEW"} | ${result.turns.map((turn) => turn.action).join(" → ")} | ${result.snapshot.status} |`
    );
  }

  lines.push(
    "",
    "## Generalization Probes",
    "",
    "These exploratory prompts express familiar intents without the keywords used by the deterministic Mock provider.",
    "",
    "| Provider | Probe | Result | Action |",
    "| --- | --- | --- | --- |"
  );
  for (const result of generalizationResults) {
    lines.push(
      `| ${result.providerId} | ${escapeTable(result.scenario.name)} | ${result.pass ? "PASS" : "MISSED"} | ${result.turns.map((turn) => turn.action).join(" → ")} |`
    );
  }

  lines.push("", "## Action Coverage", "", "| Action | Mock | Jev |", "| --- | ---: | ---: |");
  for (const action of AVAILABLE_ACTIONS) {
    lines.push(
      `| ${action} | ${coverage.mock?.has(action) ? "reached" : "—"} | ${coverage.jev?.has(action) ? "reached" : "—"} |`
    );
  }

  lines.push(
    "",
    "## Confidence Review",
    "",
    "Confidence is recorded as an evaluation signal and does not by itself pass or fail a gameplay turn.",
    "",
    "| Provider | Turns | Average confidence | Minimum confidence | Below 0.50 | Mean top-two margin |",
    "| --- | ---: | ---: | ---: | ---: | ---: |"
  );
  for (const provider of providers) {
    const summary = summarizeConfidence(results, provider);
    lines.push(
      `| ${provider} | ${summary.turnCount} | ${summary.average.toFixed(2)} | ${summary.minimum.toFixed(2)} | ${summary.lowCount} | ${summary.averageMargin === null ? "—" : summary.averageMargin.toFixed(2)} |`
    );
  }

  const stats = dialogueAudit.statistics;
  lines.push(
    "",
    "## Dialogue Content Audit",
    "",
    `Dialogue lint: ${dialogueAudit.errors.length ? "FAIL" : "PASS"}`,
    "",
    "| Actions | Authored fragments | Template entries | Conditional branches | Possible rendered lines | Warnings |",
    "| ---: | ---: | ---: | ---: | ---: | ---: |",
    `| ${stats.actionCount} | ${stats.authoredFragments} | ${stats.templateEntries} | ${stats.branchCount} | ${stats.possibleLines} | ${dialogueAudit.warnings.length} |`
  );

  lines.push("", "## Failure Handling", "", "| Check | Result | Evidence |", "| --- | --- | --- |");
  for (const edgeCase of edgeCases) {
    lines.push(
      `| ${edgeCase.name} | ${edgeCase.pass ? "PASS" : "FAIL"} | ${escapeTable(edgeCase.evidence)} |`
    );
  }

  const mismatches = coreResults.flatMap((result) =>
    result.turns
      .filter((turn) => !turn.acceptable)
      .map(
        (turn) =>
          `${result.providerId} / ${result.scenario.name}: ${turn.action} for “${turn.input}” (expected ${turn.expected.join(" or ")})`
      )
  );
  const dialogueGaps = results.flatMap((result) =>
    result.turns
      .filter((turn) => !turn.dialogue)
      .map((turn) => `${result.providerId} / ${result.scenario.name}: ${turn.action}`)
  );
  const unresolvedTemplates = results.flatMap((result) =>
    result.turns
      .filter((turn) => /\{[a-zA-Z][\w-]*\}/.test(turn.dialogue))
      .map((turn) => `${result.providerId} / ${result.scenario.name}: ${turn.dialogue}`)
  );
  const lowConfidenceTurns = results.flatMap((result) =>
    result.turns
      .filter((turn) => turn.confidence < 0.5)
      .map(
        (turn) =>
          `${result.providerId} / ${result.scenario.name}: ${turn.action} at ${turn.confidence.toFixed(2)}`
      )
  );
  const uniqueReplies = new Set(results.flatMap((result) => result.turns.map((turn) => turn.dialogue)));
  const mockCorePasses = corePasses("mock");
  const jevCorePasses = corePasses("jev");
  const mockGeneralizationPasses = generalizationPasses("mock");
  const jevGeneralizationPasses = generalizationPasses("jev");
  const recommendation =
    jevCorePasses >= mockCorePasses && jevGeneralizationPasses > mockGeneralizationPasses
      ? `Retain Jev as the optional intelligent provider: it matched the Mock provider on the core scenarios and handled more unfamiliar phrasings (${jevGeneralizationPasses}/${generalizationScenarios.length} versus ${mockGeneralizationPasses}/${generalizationScenarios.length}). Keep Mock as the offline fallback.`
      : "Keep Jev experimental: this run did not show a clear decision-quality advantage over the Mock provider.";

  lines.push(
    "",
    "## Findings",
    "",
    `- Mock core scenario checks: ${mockCorePasses}/${coreScenarios.length} passed.`,
    `- Jev core scenario checks: ${jevCorePasses}/${coreScenarios.length} passed.`,
    `- Mock generalization probes: ${mockGeneralizationPasses}/${generalizationScenarios.length} passed.`,
    `- Jev generalization probes: ${jevGeneralizationPasses}/${generalizationScenarios.length} passed.`,
    `- Invalid-output and offline recovery checks: ${edgeCases.filter((edgeCase) => edgeCase.pass).length}/${edgeCases.length} passed.`,
    `- Confusing or unexpected action choices: ${mismatches.length ? mismatches.join("; ") : "none in this run"}.`,
    `- Missing authored dialogue: ${dialogueGaps.length ? dialogueGaps.join("; ") : "none in this run"}.`,
    `- Unresolved dialogue template slots: ${unresolvedTemplates.length ? unresolvedTemplates.join("; ") : "none in this run"}.`,
    `- Low-confidence turns below 0.50: ${lowConfidenceTurns.length ? lowConfidenceTurns.join("; ") : "none in this run"}.`,
    `- Unique authored replies observed: ${uniqueReplies.size}.`,
    `- Dialogue lint: ${dialogueAudit.errors.length ? `${dialogueAudit.errors.length} errors` : "passed with no errors"}; ${stats.possibleLines} possible rendered lines.`,
    `- Mock action coverage: ${coverage.mock?.size ?? 0}/${AVAILABLE_ACTIONS.length}.`,
    `- Jev action coverage in the comparison scenarios: ${coverage.jev?.size ?? 0}/${AVAILABLE_ACTIONS.length}.`,
    "",
    "## Recommendation",
    "",
    recommendation,
    "",
    "## Turn Log"
  );

  for (const result of results) {
    lines.push("", `### ${result.providerId}: ${result.scenario.name}`, "");
    lines.push("| Turn | Player input | Selected action | Confidence | Authored reply | Check |");
    lines.push("| ---: | --- | --- | ---: | --- | --- |");
    result.turns.forEach((turn, index) => {
      lines.push(
        `| ${index + 1} | ${escapeTable(turn.input)} | ${turn.action} | ${turn.confidence.toFixed(2)} | ${escapeTable(turn.dialogue)} | ${turn.acceptable ? "PASS" : "REVIEW"} |`
      );
    });
  }

  lines.push("");
  return lines.join("\n");
}

const npcTemplate = await loadFixture("data/arthur.json");
const dialogueData = await loadFixture("data/dialogue.json");
const dialogueAudit = lintDialogueData(dialogueData, AVAILABLE_ACTIONS);
if (dialogueAudit.errors.length) {
  throw new Error(`Dialogue lint failed: ${dialogueAudit.errors.join(" ")}`);
}
const jevProvider = (context, availableActions) =>
  chooseJevAction(context, availableActions, { endpoint: JEV_PROXY_URL });
const providerConfigs = [
  { providerId: "mock", provider: chooseMockAction, npcTemplate, dialogueData },
  { providerId: "jev", provider: jevProvider, npcTemplate, dialogueData }
];

const results = [];
const allScenarios = [
  ...coreScenarios.map((scenario) => ({ ...scenario, category: "core" })),
  ...generalizationScenarios.map((scenario) => ({ ...scenario, category: "generalization" }))
];
for (const providerConfig of providerConfigs) {
  for (const scenario of allScenarios) {
    results.push(await runScenario(providerConfig, scenario));
  }
}

const edgeCases = await runEdgeCases(npcTemplate, dialogueData);
await writeFile(REPORT_PATH, renderReport(results, edgeCases, dialogueAudit), "utf8");

const coreReviewCount = results.filter(
  (result) => result.scenario.category === "core" && !result.pass
).length;
const probePassCount = results.filter(
  (result) => result.scenario.category === "generalization" && result.pass
).length;
const edgeFailureCount = edgeCases.filter((edgeCase) => !edgeCase.pass).length;
console.log(`Playtest report written to ${fileURLToPath(REPORT_PATH)}`);
console.log(`Core scenario checks: ${coreScenarios.length * providerConfigs.length - coreReviewCount}/${coreScenarios.length * providerConfigs.length} passed`);
console.log(`Generalization probes: ${probePassCount}/${generalizationScenarios.length * providerConfigs.length} matched expected actions`);
console.log(`Failure handling: ${edgeCases.length - edgeFailureCount}/${edgeCases.length} passed`);
console.log(`Dialogue content: ${dialogueAudit.statistics.possibleLines} possible rendered lines; ${dialogueAudit.warnings.length} lint warnings`);

if (coreReviewCount || edgeFailureCount) process.exitCode = 1;
