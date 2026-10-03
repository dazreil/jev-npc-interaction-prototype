# The Silver Edit

A visual novel / talking sim made with the vault engine. **This slice:** Elena's first day at *Vellum & Vine* and her first dream of Malphas.

## Play it
From the repo folder: `npm run app:silver`. Edit a screen in the game with **Cmd+E**.

## Where things are
- [[World.canvas]] — the screens (office, home, dream) and where things sit.
- [[Arthur.canvas]], [[Miles.canvas]], [[Chloe.canvas]], [[Malphas.canvas]] — each character: notes, moods, actions, lines, and their art cards (not made yet).
- [[office.canvas]], [[home.canvas]], [[dream.canvas]] — each screen's art cards.
- [[Assets.canvas]] — the style library.

## How a character works
Each has their own moods in `## State` (Arthur: trust, warmth, irritation; Malphas: temptation, patience). Their actions say when they are allowed, what they change, and when the offline Mock picks them (`## Mock`). In the dream, refusing Malphas wears his patience down ([[elena-refuses]]); the **Wake up.** button appears when it is low.

Check the vault: `GAME_VAULT=silver-edit npm run vault:check`.
