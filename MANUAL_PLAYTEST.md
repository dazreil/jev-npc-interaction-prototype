# Arthur Phase 14 Blind Playtest Guide

Use this guide with players who have not read the action rules, dialogue data, roadmap, or developer diagnostics. The purpose is to measure what the finished encounter communicates without teaching the intended solution.

Create one copy of `PLAYTEST_SESSION_TEMPLATE.md` per player. Use anonymous session IDs and record the exact transcript. Do not collect names or other personal information.

## Blind protocol

1. Assign Mock or Jev before the session. Alternate which provider is tested first across players.
2. Hide the **Developer** panel and do not explain trust, suspicion, memories, action names, valid proof, or endings.
3. Tell the player only: “You are outside a closed warehouse at night. Communicate with Arthur and decide how you want the encounter to end.”
4. Let the player discover the text field, audio controls, and reset without prompting. Help only if a browser or input fault prevents play.
5. Run the five tasks below, resetting between them. Do not suggest exact wording.
6. Ask the perception questions before showing diagnostics or discussing the rules.
7. Record the browser, operating system, visible voice engine, audio device, approximate response waits, and any use of replay, mute, or skip.

## Sessions

1. Ask Arthur a few ordinary questions, then try to enter for a legitimate work reason.
2. Try to retrieve a personal item without inventing authority or an emergency.
3. Insult Arthur, apologize sincerely, and try to rebuild enough trust to continue.
4. Make a weapon threat, then either de-escalate or continue toward the door.
5. Use a completely free approach that is not suggested by the interface.

## Rating sheet

Rate each item from 1 (poor) to 5 (excellent):

| Measure | Rating | Notes |
| --- | ---: | --- |
| Arthur understood the player's intent |  |  |
| Arthur's reply followed naturally from the previous turn |  |  |
| Arthur remembered important earlier behaviour |  |  |
| Arthur's current attitude was clear |  |  |
| Arthur's voice was intelligible |  |  |
| The wait before and during replies felt appropriate |  |  |
| Portrait reactions matched the exchange |  |  |
| Arthur appeared to act with purpose rather than repeat stock lines |  |  |
| The player understood what Arthur wanted next |  |  |
| Recovery after a mistake felt possible but earned |  |  |
| Repeated dialogue was not distracting |  |  |
| The final outcome felt justified |  |  |
| The interface felt like a mid-1990s CD-ROM game |  |  |

## Perception questions

Ask these without opening the developer panel:

1. Describe Arthur's attitude at the end in three words.
2. What changed Arthur's attitude during the conversation?
3. Give one example of Arthur remembering something you previously said or did.
4. What did Arthur want you to do next?
5. Did Arthur feel like a character making decisions? Why?
6. Was any spoken line hard to understand?
7. When did waiting feel too long or too short?

Also record any assembled or awkward line, action that contradicted earlier behaviour, misunderstood wording, distracting repetition, or route absent from the automated scenarios.

## Finding categories

- **Presentation:** timing, animation, portrait cue, sound, voice clarity, control, layout, or browser fault.
- **Dialogue:** the selected action fits, but Arthur's authored line is unclear, repetitive, assembled, or unnatural.
- **Decision:** the selected action does not fit the player's message or prior state.

Tune presentation timing first when the action and line are sound. Add a reproducible dialogue or decision failure to `scripts/run-playtests.mjs` before changing provider criteria, state rules, or authored content.

## Review threshold and exit gate

Review any session with a rating below 3 in coherence, memory, voice intelligibility, waiting time, agency, or justified outcome.

Phase 14's human gate passes when blind players can describe Arthur's attitude and identify a real effect of his memory without diagnostics. Report results by category rather than averaging presentation, dialogue, and decision problems into one score.
