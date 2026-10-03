---
type: portraits
character: "[[Malphas]]"
offset: [0, 0]
zoom: 1
backdropFocus: [50, 50]
backdropZoom: 1
---

# Malphas — portraits

The talk portrait is two layers, each placed on its own (in the game: Cmd+E, select the portrait, then **Option-drag** moves Malphas, **Option-Shift-drag** moves the background):

- **Background:** the screen behind them, cut around their click box with a 10 pixel bleed (`malphas-backdrop` on [[Malphas.canvas]]).
- **Character:** Malphas cut out of the green screen (`malphas-actor-cut`), standing in front.

`offset` and `zoom` place the character (percent of the box); `backdropFocus` and `backdropZoom` place the background. Talking loops, moods and blinks come later.

## Idle
```yaml
frame: "[[malphas-actor-cut.webp]]"
```

## Backdrop
```yaml
image: "[[malphas-backdrop.webp]]"
```
