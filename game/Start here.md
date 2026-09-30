# Start here

This vault **is the game**. Every note with a `type` property is game data. Everything else is ignored, so write notes to yourself anywhere.

It is a copy of the Arthur encounter as it works today. See `ENGINE_SPEC.md` in the repo for the full rules.

## Look at these first
1. [[World.canvas|World]] — **the game itself**. Screens are groups; drag cards to place things.
2. [[Assets.canvas|Assets]] — make game art and limited animation with AI (fal.ai).
3. [[arthur-tree.canvas|Arthur's dialogue tree]] — the talk flow, including the fake ID and the company call.
4. [[Arthur]] — the character. Change a number in Properties to change him.
5. [[ALLOW_ENTRY]] — one action: when he may pick it, what it does, and what the model is told.
6. [[refuse-entry]] — his lines for one action, written like a script.
7. [[south-gate]] — a screen with hotspots.
8. [[end-locked-out]] — an event that ends the game.
9. [[intercom-hud]] — a custom UI made of images and shapes. See it live with `npm run workbench`, then open http://localhost:5174
10. [[check]] — the checker report.

Then open **Graph view** (left bar, or `Cmd+G`). Colours: orange = actions, green = lines, purple = profiles, blue = screens, red = events, yellow = endings.

## How a note holds data
- **Properties** (top of the note): simple values. `available` and `effects` use the short form, such as `state.suspicion < 78`.
- **Headings with bullets:** lines Arthur can say.
- **`yaml` code blocks under a heading:** nested rules.
- **Anything else:** a comment. `%% hidden comments %%` too.

## New things
Use **Templates** (`Cmd+P` → "Templates: Insert template") in an empty note. Starters are in `_templates`.

## Play it
Run the desktop app from the repo folder: `npm run app`. The intercom is an object in the gate scene. Click it, or press `C`.

## What does not work yet
The screens, objects, and UI come from this vault. Arthur's lines and rules still come from `data/*.json` and the code. Rebuild this vault from the live game with:

    npm run vault:export
