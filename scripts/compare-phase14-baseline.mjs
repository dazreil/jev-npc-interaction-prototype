import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);
const reportPath = new URL("../PLAYTEST_REPORT.md", import.meta.url);
const outputPath = new URL("../PHASE14_PARITY_REPORT.md", import.meta.url);
const baselineRef = process.env.PHASE14_BASELINE ?? "de767cf";

function parseTable(report, heading) {
  const marker = `## ${heading}`;
  const start = report.indexOf(marker);
  if (start < 0) throw new Error(`Missing report section: ${heading}`);
  const rest = report.slice(start + marker.length);
  const end = rest.search(/\n## /);
  const section = end < 0 ? rest : rest.slice(0, end);
  const rows = section
    .split("\n")
    .filter((line) => line.startsWith("|") && !line.includes("---"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
  const [header, ...body] = rows;
  if (!header || body.length === 0) throw new Error(`Missing table rows: ${heading}`);
  return body.map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index]])));
}

function keyed(rows, nameField) {
  return new Map(rows.map((row) => [`${row.Provider}::${row[nameField]}`, row]));
}

function generatedAt(report) {
  return report.match(/^Generated: (.+)$/m)?.[1] ?? "unknown";
}

function escapeCell(value) {
  return String(value ?? "—").replaceAll("|", "\\|");
}

const currentReport = await readFile(reportPath, "utf8");
const [{ stdout: baselineReport }, { stdout: currentCommit }] = await Promise.all([
  execFileAsync("git", ["show", `${baselineRef}:PLAYTEST_REPORT.md`], {
    cwd: new URL("..", import.meta.url)
  }),
  execFileAsync("git", ["rev-parse", "HEAD"], { cwd: new URL("..", import.meta.url) })
]);

const baselineCore = keyed(parseTable(baselineReport, "Core Scenario Results"), "Scenario");
const currentCore = keyed(parseTable(currentReport, "Core Scenario Results"), "Scenario");
const baselineProbes = keyed(parseTable(baselineReport, "Generalization Probes"), "Probe");
const currentProbes = keyed(parseTable(currentReport, "Generalization Probes"), "Probe");

const coreComparisons = [...baselineCore].map(([key, baseline]) => {
  const current = currentCore.get(key);
  const exact = Boolean(
    current &&
    current.Result === baseline.Result &&
    current.Actions === baseline.Actions &&
    current["Final status"] === baseline["Final status"]
  );
  return { key, baseline, current, exact };
});
const probeComparisons = [...baselineProbes].map(([key, baseline]) => {
  const current = currentProbes.get(key);
  const exact = Boolean(
    current && current.Result === baseline.Result && current.Action === baseline.Action
  );
  return { key, baseline, current, exact };
});

const coreExact = coreComparisons.filter(({ exact }) => exact).length;
const probesExact = probeComparisons.filter(({ exact }) => exact).length;
const missingCurrentCore = [...currentCore.keys()].filter((key) => !baselineCore.has(key));
const missingCurrentProbes = [...currentProbes.keys()].filter((key) => !baselineProbes.has(key));
const passed =
  coreExact === coreComparisons.length &&
  probesExact === probeComparisons.length &&
  missingCurrentCore.length === 0 &&
  missingCurrentProbes.length === 0;

const lines = [
  "# Phase 14 Provider Parity Report",
  "",
  `Generated: ${new Date().toISOString()}`,
  `Pre-conversion baseline: \`${baselineRef}\` (${generatedAt(baselineReport)})`,
  `Current implementation: \`${currentCommit.trim()}\` (${generatedAt(currentReport)})`,
  "",
  "## Result",
  "",
  passed ? "**PASS — structured decision behaviour retains exact parity.**" : "**REVIEW — parity changed.**",
  "",
  `- Core action sequences, results, and final states: ${coreExact}/${coreComparisons.length} exact matches.`,
  `- Generalization probe actions and results: ${probesExact}/${probeComparisons.length} exact matches.`,
  `- Added or unpaired current rows: ${missingCurrentCore.length + missingCurrentProbes.length}.`,
  "",
  "## Core Scenario Comparison",
  "",
  "| Provider | Scenario | Baseline actions | Current actions | Final state | Parity |",
  "| --- | --- | --- | --- | --- | --- |"
];

for (const { baseline, current, exact } of coreComparisons) {
  lines.push(
    `| ${escapeCell(baseline.Provider)} | ${escapeCell(baseline.Scenario)} | ${escapeCell(baseline.Actions)} | ${escapeCell(current?.Actions)} | ${escapeCell(current?.["Final status"])} | ${exact ? "EXACT" : "CHANGED"} |`
  );
}

lines.push(
  "",
  "## Generalization Comparison",
  "",
  "| Provider | Probe | Baseline | Current | Parity |",
  "| --- | --- | --- | --- | --- |"
);
for (const { baseline, current, exact } of probeComparisons) {
  lines.push(
    `| ${escapeCell(baseline.Provider)} | ${escapeCell(baseline.Probe)} | ${escapeCell(`${baseline.Result}: ${baseline.Action}`)} | ${escapeCell(current ? `${current.Result}: ${current.Action}` : "missing")} | ${exact ? "EXACT" : "CHANGED"} |`
  );
}

lines.push(
  "",
  "The comparison intentionally ignores confidence drift and authored wording changes. Those are recorded in `PLAYTEST_REPORT.md`; this gate protects the provider-selected actions and deterministic encounter outcomes.",
  ""
);

await writeFile(outputPath, lines.join("\n"), "utf8");
console.log(`Phase 14 parity: ${passed ? "PASS" : "REVIEW"}`);
console.log(`Core scenarios: ${coreExact}/${coreComparisons.length} exact`);
console.log(`Generalization probes: ${probesExact}/${probeComparisons.length} exact`);

if (!passed) process.exitCode = 1;
