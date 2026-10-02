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

## Check it
Everything in the game comes from this vault: screens, objects, UI, Arthur's lines, profiles, actions, the dialogue tree, and the events that end the talk. To check the vault for broken links, missing lines, and detector tests:

    npm run vault:check

The result is in [[check]] (`_reports/check.md`).

## Arrange a screen
In the game, press **Cmd+E** (Game → Edit screen). Drag things to move them, drag a corner to resize, and use the layer list to change what is in front. Click **▸** on a layer to move the parts inside it. **Cmd+S** saves into the vault.

## Make something new
`Cmd+P` → **Game Tools: New character… / New scene… / New item…**. Give it a name and a one-line description. You get its own folder, its notes, and its own canvas with every art card ready to run. Each thing's art saves into its folder's `art/`.

- [[Arthur.canvas]] — everything about Arthur.
- [[south-gate.canvas]] — the gate screen and its art.
- [[contractor-id.canvas]] — the ID card.
- [[Assets.canvas]] — the art guide and the style library.

## What does not work yet
- The workbench hotspot tool and replay (spec section 12).
