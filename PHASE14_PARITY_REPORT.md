# Phase 14 Provider Parity Report

Generated: 2026-09-20T10:12:10.566Z
Pre-conversion baseline: `de767cf` (2026-09-19T23:19:23.433Z)
Current implementation: `cc84befd7681c53d414c3a5cc935038d2dffabca` (2026-09-20T10:12:09.533Z)

## Result

**PASS — structured decision behaviour retains exact parity.**

- Core action sequences, results, and final states: 28/28 exact matches.
- Generalization probe actions and results: 10/10 exact matches.
- Added or unpaired current rows: 0.

## Core Scenario Comparison

| Provider | Scenario | Baseline actions | Current actions | Final state | Parity |
| --- | --- | --- | --- | --- | --- |
| mock | Polite visitor with no evidence | ASK_FOR_REASON → ANSWER_QUESTION → REFUSE_ENTRY | ASK_FOR_REASON → ANSWER_QUESTION → REFUSE_ENTRY | active | EXACT |
| mock | Head-office claim followed by credible proof | ASK_FOR_PROOF → ALLOW_ENTRY | ASK_FOR_PROOF → ALLOW_ENTRY | success | EXACT |
| mock | Player asks Arthur's name | ANSWER_QUESTION | ANSWER_QUESTION | active | EXACT |
| mock | Boiler emergency with useful technical detail | ASK_FOR_PROOF → ALLOW_ENTRY | ASK_FOR_PROOF → ALLOW_ENTRY | success | EXACT |
| mock | Contradictory story across turns | ASK_FOR_PROOF → BECOME_SUSPICIOUS | ASK_FOR_PROOF → BECOME_SUSPICIOUS | active | EXACT |
| mock | Honest repair after a contradiction | ASK_FOR_PROOF → BECOME_SUSPICIOUS → REPAIR_CONVERSATION → ALLOW_ENTRY | ASK_FOR_PROOF → BECOME_SUSPICIOUS → REPAIR_CONVERSATION → ALLOW_ENTRY | success | EXACT |
| mock | Bribe attempt | BECOME_SUSPICIOUS | BECOME_SUSPICIOUS | active | EXACT |
| mock | Direct forced-entry threat against courageous Arthur | THREATEN_PLAYER | THREATEN_PLAYER | active | EXACT |
| mock | Gun threat at the warehouse door | DEESCALATE_THREAT | DEESCALATE_THREAT | active | EXACT |
| mock | Boundary threat after weapon de-escalation | DEESCALATE_THREAT → THREATEN_PLAYER | DEESCALATE_THREAT → THREATEN_PLAYER | active | EXACT |
| mock | Repeated hostility after a warning | WARN_PLAYER → END_CONVERSATION | WARN_PLAYER → END_CONVERSATION | failure | EXACT |
| mock | Distress acknowledged without granting access | SHOW_SYMPATHY | SHOW_SYMPATHY | active | EXACT |
| mock | Apology and recovery after an insult | WARN_PLAYER → REPAIR_CONVERSATION → ASK_FOR_PROOF → ALLOW_ENTRY | WARN_PLAYER → REPAIR_CONVERSATION → ASK_FOR_PROOF → ALLOW_ENTRY | success | EXACT |
| mock | Sympathy-based appeal followed by cooperation | SHOW_SYMPATHY → ASK_FOR_PROOF → ALLOW_ENTRY | SHOW_SYMPATHY → ASK_FOR_PROOF → ALLOW_ENTRY | success | EXACT |
| jev | Polite visitor with no evidence | ASK_FOR_REASON → ANSWER_QUESTION → REFUSE_ENTRY | ASK_FOR_REASON → ANSWER_QUESTION → REFUSE_ENTRY | active | EXACT |
| jev | Head-office claim followed by credible proof | ASK_FOR_PROOF → ALLOW_ENTRY | ASK_FOR_PROOF → ALLOW_ENTRY | success | EXACT |
| jev | Player asks Arthur's name | ANSWER_QUESTION | ANSWER_QUESTION | active | EXACT |
| jev | Boiler emergency with useful technical detail | ASK_FOR_PROOF → ALLOW_ENTRY | ASK_FOR_PROOF → ALLOW_ENTRY | success | EXACT |
| jev | Contradictory story across turns | ASK_FOR_PROOF → BECOME_SUSPICIOUS | ASK_FOR_PROOF → BECOME_SUSPICIOUS | active | EXACT |
| jev | Honest repair after a contradiction | ASK_FOR_PROOF → BECOME_SUSPICIOUS → REPAIR_CONVERSATION → ALLOW_ENTRY | ASK_FOR_PROOF → BECOME_SUSPICIOUS → REPAIR_CONVERSATION → ALLOW_ENTRY | success | EXACT |
| jev | Bribe attempt | BECOME_SUSPICIOUS | BECOME_SUSPICIOUS | active | EXACT |
| jev | Direct forced-entry threat against courageous Arthur | WARN_PLAYER | WARN_PLAYER | active | EXACT |
| jev | Gun threat at the warehouse door | DEESCALATE_THREAT | DEESCALATE_THREAT | active | EXACT |
| jev | Boundary threat after weapon de-escalation | DEESCALATE_THREAT → THREATEN_PLAYER | DEESCALATE_THREAT → THREATEN_PLAYER | active | EXACT |
| jev | Repeated hostility after a warning | WARN_PLAYER → END_CONVERSATION | WARN_PLAYER → END_CONVERSATION | failure | EXACT |
| jev | Distress acknowledged without granting access | SHOW_SYMPATHY | SHOW_SYMPATHY | active | EXACT |
| jev | Apology and recovery after an insult | WARN_PLAYER → REPAIR_CONVERSATION → ASK_FOR_PROOF → ALLOW_ENTRY | WARN_PLAYER → REPAIR_CONVERSATION → ASK_FOR_PROOF → ALLOW_ENTRY | success | EXACT |
| jev | Sympathy-based appeal followed by cooperation | ASK_FOR_REASON → ASK_FOR_PROOF → ALLOW_ENTRY | ASK_FOR_REASON → ASK_FOR_PROOF → ALLOW_ENTRY | success | EXACT |

## Generalization Comparison

| Provider | Probe | Baseline | Current | Parity |
| --- | --- | --- | --- | --- |
| mock | Unfamiliar wording for a legitimate work claim | MISSED: ASK_FOR_REASON | MISSED: ASK_FOR_REASON | EXACT |
| mock | Implied bribe without money keywords | MISSED: ASK_FOR_REASON | MISSED: ASK_FOR_REASON | EXACT |
| mock | Technical danger without emergency keywords | MISSED: ASK_FOR_REASON | MISSED: ASK_FOR_REASON | EXACT |
| mock | Veiled threat without explicit threat keywords | MISSED: ASK_FOR_REASON | MISSED: ASK_FOR_REASON | EXACT |
| mock | Departure expressed with unfamiliar wording | MISSED: ASK_FOR_REASON | MISSED: ASK_FOR_REASON | EXACT |
| jev | Unfamiliar wording for a legitimate work claim | PASS: ASK_FOR_PROOF | PASS: ASK_FOR_PROOF | EXACT |
| jev | Implied bribe without money keywords | PASS: BECOME_SUSPICIOUS | PASS: BECOME_SUSPICIOUS | EXACT |
| jev | Technical danger without emergency keywords | PASS: ASK_FOR_PROOF | PASS: ASK_FOR_PROOF | EXACT |
| jev | Veiled threat without explicit threat keywords | PASS: WARN_PLAYER | PASS: WARN_PLAYER | EXACT |
| jev | Departure expressed with unfamiliar wording | PASS: END_CONVERSATION | PASS: END_CONVERSATION | EXACT |

The comparison intentionally ignores confidence drift and authored wording changes. Those are recorded in `PLAYTEST_REPORT.md`; this gate protects the provider-selected actions and deterministic encounter outcomes.
