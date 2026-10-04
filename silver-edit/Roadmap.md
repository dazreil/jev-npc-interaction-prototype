# The Silver Edit — roadmap

What we build, in order. The story is in `the_silver_edit_project_overview.md` (Book One). The game covers Book One in **days**: each day is the office, then home, then a dream.

Costs are fal.ai estimates. Nothing is generated until we agree to it.

## What "Chapter One done" means

Chapter One is Elena's **first day**, played start to end in about 10–15 minutes:

- The office: talk to Arthur, Miles and Chloe. Each talk can end well or badly, and changes what they think of Elena.
- Home: Elena's cottage, with one or two things to look at that tell her past.
- The dream: Malphas tempts her. She resists (wakes at 3:12 am) or yields (game over).
- Every screen has finished art. Every speaking character has a talking portrait.
- There is sound: room tone for each screen, and music for the dream.
- A tester who does not know the story can finish it, and understands who Elena is and what Malphas wants.

## Phase 1 — Finish the first day

| # | Work | Cost | Status |
| --- | --- | --- | --- |
| 1.1 | Office: desks, people, click shapes, portrait backgrounds | done | **Done** |
| 1.2 | Home: put Elena's things in the cottage — the Volvo keys, a box she has not unpacked (coven things she cannot throw away), a mirror (her grey hair). Each is an object with a short look-at text. | ~$0.02 | **Done** |
| 1.3 | Dream: Malphas in the scene, cut out, with a click shape (he is talked to by clicking him). The velvet-void background reworked to match. | ~$0.05 | **Done** |
| 1.4 | Talking portraits: a talking loop for Arthur, Miles, Chloe and Malphas (neutral mood first). | ~$0.52 | **Done** |
| 1.4b | Scenes for the first day, made in the story editor (Cmd+E → Story): Arthur, Miles, Chloe and the dream each open with a short scripted beat and a choice, then free talk with the AI. | free | **Done** |
| 1.5 | Moods: friendly / irritated pictures for the three office people, so their face follows the talk. | ~$0.22 | **Done** (still faces; mood talking loops later) |
| 1.6 | Sound: office room tone (rain on windows), cottage (wind, the Volvo ticking), dream music. | free (library sounds) | Music **done** (Strudel, free); room sound effects later |
| 1.7 | Title screen and an end card for each ending. | ~$0.05 | |
| 1.8 | Playtest Chapter One with the Mock and with Jev; fix what testers miss. | free | |

## Phase 2 — Days two to five (the middle)

The relationship and the mystery grow, one day at a time.

| # | Work | Engine work needed? |
| --- | --- | --- |
| 2.1 | **Days.** A day counter, so the office, home and dream change each day (who is there, what they say, what Malphas offers). | Small: a `day` counter (`counter day +1`) and `counter.day = 2` conditions already work. Each character's talk must also reset for the new day, and that needs engine work. |
| 2.2 | **Arthur.** His warmth toward Elena carries over between days. A late-evening talk on day 3 or 4 where he speaks about his wife. | No: his `## State` already keeps warmth. |
| 2.3 | **The medical files.** An item Elena finds in Arthur's office (an object on the office screen, picked up). Reading it shows the soul-siphon symptoms. | No: items in scenes and picking up work now. |
| 2.4 | **Chloe's sketches.** On a later day Chloe shows a sketch of something from Elena's dream. What Elena says decides how much Chloe trusts her. | No. |
| 2.5 | **Malphas escalates.** Each night's dream is harder to resist; his patience starts lower and his offers grow. | No: his state and events already do this. |
| 2.6 | **Saving the game.** With several days, the player needs to stop and come back. | **Yes:** a save and load of the world and each character's state. |

## Phase 3 — Samhain (the climax)

| # | Work |
| --- | --- |
| 3.1 | The festival in town: a new screen at night, crowds, lanterns. |
| 3.2 | Malphas in the flesh: he offers godhood. Everything the player built up (Arthur's trust, Chloe's sight, the medical files) decides which answers Elena has. |
| 3.3 | The banishing, and the silver hair: Elena's portrait changes. |

## Phase 4 — After

| # | Work |
| --- | --- |
| 4.1 | The Dead Winter: the town's art turns from red autumn to grey frost. |
| 4.2 | Endings: with Arthur; alone; and Chloe leaving for New York (the hook into *The Goth Edit*). |

## Open questions

1. **Does Elena have a face?** Today the player is Elena, unseen. A portrait for her would make the hair change at Samhain visible. Recommendation: yes, from Phase 3.
2. **How many days?** Recommendation: five, then Samhain. Small enough to finish, long enough for the relationship to grow.
3. **Chloe's book.** Is the spin-off a second game in the same engine, or a teaser only? Decide after Phase 3.
