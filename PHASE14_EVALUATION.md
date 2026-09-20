# Phase 14 Provider and Human Evaluation

Evaluation date: 20 September 2026  
Pre-conversion baseline: `de767cf`  
Evaluated implementation: `cc84bef` plus the Phase 14 evaluation artifacts in this change  
Live Jev model observed: `jev-1.13.0`

## Status

**Automated provider parity and local browser evaluation pass. Blind external sessions remain required for the human-perception exit gate.**

## Provider results

The unchanged Phase 8 harness was rerun against Mock and live Jev before adding Phase 14 evaluation tooling.

| Check | Result |
| --- | --- |
| Mock core scenarios | 14/14 passed |
| Live Jev core scenarios | 14/14 passed |
| Mock action coverage | 12/12 actions reached |
| Live Jev action coverage | 12/12 actions reached |
| Failure and recovery checks | 2/2 passed |
| Dialogue lint | 204 fragments, 220 possible lines, 0 warnings |
| Mock unfamiliar-phrasing probes | 0/5, unchanged by design |
| Live Jev unfamiliar-phrasing probes | 5/5 passed |

`PHASE14_PARITY_REPORT.md` compares the current rerun with the pre-conversion report. All 28 core provider/scenario rows retain the exact action sequence, pass result, and final state. All 10 exploratory provider/probe rows also retain the same action and result.

Live Jev produced two expected decisions below 0.50 confidence in the final run: `END_CONVERSATION` after repeated hostility and `SHOW_SYMPATHY` for distress. Their exact probabilities can drift between live runs and are recorded in `PLAYTEST_REPORT.md`. They remain decision-uncertainty observations rather than failures because both actions fit the scenario and match the baseline.

## Local presentation observations

Environment: macOS 26.0.1. The test machine has Safari 26.0.1 and Chrome 153.0.8010.48. Firefox and Edge are not installed, so they are not claimed as tested.

| Surface | Voice path | Observation | Approximate complete response cycle |
| --- | --- | --- | ---: |
| Codex in-app browser | eSpeak NG/WASM worker | Two consecutive Mock replies completed, input returned, voice indicator stayed `WASM`, and the console remained clear. | 3.88 s and 3.80 s |
| Chrome 153 | eSpeak NG/WASM worker | Spoken name reply completed and returned to `AWAITING INPUT`; Chrome reported active audio. | complete by 6.9 s |
| Safari 26.0.1 | eSpeak NG/WASM worker | Spoken question reply completed and returned input without the earlier stuck speaking state. | complete by 7.8 s |
| Safari 26.0.1, muted | Timed caption fallback | Reply completed with captions, input returned, and the indicator changed to `SILENT`. | complete by 2.9 s |

The samples include authored reaction and recovery beats as well as speech, and the browser checks use different randomly selected Arthur profiles and lines. They establish bounded completion rather than a browser speed ranking. The slower `sir` delivery should be watched in blind ratings before its rate is changed.

Voice intelligibility and dramatic presence require human listening and are deliberately not assigned synthetic scores. Replay, mute, skip, worker cancellation, suspended-audio fallback, and stalled-playback fallback are covered by automated tests.

## Formative owner feedback already incorporated

These observations came from iterative owner review and are useful context, but the owner is not a blind participant:

- The single monospace pixel font materially improved the 1990s CD-ROM feel.
- The split Arthur/player messaging composition was preferred over duplicated subtitles and transcript treatment.
- Repeated purpose questions and reset-like phrases made Arthur feel artificial; the authored dialogue and one-time purpose prompt were revised before this evaluation.
- Safari exposed a real speech hang. Commit `cc84bef` moved eSpeak initialization and synthesis into a module worker, reused the unlocked audio context, and added bounded fallbacks.

## Findings by cause

| Category | Finding | Decision |
| --- | --- | --- |
| Presentation | Safari could remain stuck during main-thread eSpeak initialization or playback. | Fixed and regression-tested before this report. |
| Presentation | Personality and line length produce visibly different complete-cycle times. | Preserve for blind testing; review any waiting-time rating below 3 before tuning rates. |
| Dialogue | Automated scenarios found no missing, unresolved, or out-of-context authored line. | No dialogue change from this evaluation. |
| Decision | Current action and outcome behaviour exactly matches the pre-conversion baseline. | Do not change provider criteria or deterministic rules. |
| Decision | Two Jev decisions were below 0.50 confidence while still correct. | Monitor transcripts; confidence alone does not trigger a rule change. |

## Human evaluation package

`MANUAL_PLAYTEST.md` now defines the blind protocol, expanded rating criteria, perception questions, finding categories, and exit gate. `PLAYTEST_SESSION_TEMPLATE.md` is the fillable record for each participant.

The remaining gate needs people who have not read the rules. At minimum, the completed records must show that players can describe Arthur's attitude and cite one real way earlier behaviour affected him without opening diagnostics. Any score below 3 for coherence, memory, voice, waiting time, agency, or outcome requires review in the relevant category.
