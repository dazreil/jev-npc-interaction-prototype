# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is the author, working alone. This is personal research and
development, not a product with an outside audience yet.

The in-fiction player is a visitor at a locked warehouse car-park gate at night,
trying to talk their way past the guard. That role exists to exercise the
encounter, not to describe a confirmed market.

No external audience has been established. Future work must not invent one.

## Product Purpose

Find out whether a decision model directing hand-authored NPC dialogue makes a
character feel reactive and autonomous.

The player types freely. The model reads bounded context and selects one action
from an authored list. The game supplies the written line, the performance, the
portrait animation, the sound, and the state change.

Success for this slice is proof, not reach: the author needs to be convinced the
Jev-directed authored-performance model is fun and legible, and then expand it
into a larger game with more NPCs and locations. Public hosting, portfolio use,
and reference-implementation polish are explicitly not the goal.

## Positioning

The model never writes dialogue. It classifies the situation and picks a
structured action; every spoken word was written by hand in advance. That split
is the thing being tested, and it is what a generation-first NPC could not
truthfully claim.

## Operating Context

One location, one NPC, one complete encounter, played in a desktop browser.

Two release modes serve the same framework-free files:

- Mock-only static hosting, with the deterministic provider and no credentials.
- Server-backed hosting, where a Node proxy keeps the TypeSafe key server-side
  and the player can switch between Mock and Jev.

Development runs `node server.mjs` on port 5173. The server does not hot-reload,
so provider edits need a restart before they take effect.

## Capabilities and Constraints

Confirmed and working:

- Vanilla HTML, CSS, and JavaScript with JSON content. No framework, bundler, or
  build step. A small Node server provides the Jev proxy and static files.
- A bounded action vocabulary of twelve actions, validated before use. An
  invalid or unavailable choice falls back rather than reaching the player.
- Arthur's state tracks trust, suspicion, irritation, and fear, clamped 0-100.
- Structured memories plus recent exchanges feed later decisions. Contradictions,
  repairs, threats, and proof routes all work.
- An outstanding request Arthur puts to the player survives across turns until
  the player settles it.
- Four authored endings, reachable through more than one wording.
- Speech is a local Piper neural voice through WebAssembly, with eSpeak NG, Web
  Speech, and timed captions beneath it as fallbacks. Voice selection and tuning
  are actively being iterated.
- A developer panel explains every accepted decision and state change.

Deferred by the author until the slice proves itself: multiple locations or
NPCs, inventory and quests, a dialogue editor, full-motion video, cloud or paid
per-character voices, accounts or a database, modding support, a mobile-first
layout, and any framework migration.

Undecided: whether this ever ships to anyone else, and in what form.

## Brand Commitments

**The mid-1990s CD-ROM look is binding.** The fixed 4:3 terminal, the pixelated
photographic characters, the small low-frame-rate panels, the industrial
interface graphics, and the period speech character are the point of the
project, not decoration. Future work must not modernise them.

**Hand-authored dialogue is binding.** Every line Arthur speaks was written in
advance. The decision model selects an action and never produces prose that
reaches the player. Future work cannot trade this away for generated dialogue.

Arthur is the established character: a night guard in Guard Tower 04, beyond a
locked car-park gate, speaking through a camera intercom. He is practical rather
than analytical, follows rules, and can still respond humanely.

## Evidence on Hand

Real, in-repository:

- `data/dialogue.json` — the authored corpus, 209 fragments across 12 actions,
  223 possible rendered lines.
- `data/arthur.json` — personality, goals, and starting state.
- `assets/` — Arthur portrait, four speaking frames, nine reaction frames, the
  gate animation, and the bundled VT323 font.
- `RETRO_CDROM_DESIGN_SPEC.md` — the authored design specification and roadmap.
- `PLAYTEST_REPORT.md`, `PHASE14_EVALUATION.md`, `PHASE14_PARITY_REPORT.md` —
  generated evaluation output.
- A test suite and a dialogue linter run by `npm run check`.

There are no users, no testimonials, no published metrics, and no third-party
validation. Future work must not fabricate any.

Note: the shipped Piper voice has MIT weights but was trained on a CC-BY-SA 4.0
dataset, so attribution is expected and share-alike may extend to generated
audio. Unresolved, and only material if this is ever distributed.

## Product Principles

1. **Authored words, directed delivery.** The model chooses what Arthur does.
   Humans choose what he says. Any feature that blurs this defeats the project.
2. **The period look is the product.** A change that reads as modern is a
   regression, however well crafted.
3. **Prove it before growing it.** Scope stays at one location, one NPC, one
   encounter until the core question is answered.
4. **Never dead-end the player.** Provider failure, network loss, and missing
   media each degrade to something playable rather than stopping the encounter.
5. **Show the work.** The decision, its confidence, the state change, and the
   memory behind it stay inspectable, because the author is the primary user and
   is here to learn whether this works.

## Accessibility & Inclusion

No external accessibility standard has been set, because there is no outside
audience yet.

The build currently keeps subtitles on by default, honours
`prefers-reduced-motion`, and offers mute, volume, replay, and skip. The author
did not mark these as binding commitments, so treat them as valuable current
behaviour to preserve by default, not as fixed requirements.
