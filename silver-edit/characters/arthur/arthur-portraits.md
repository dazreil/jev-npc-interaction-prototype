---
type: portraits
character: "[[Arthur]]"
offset: [0, 0]
zoom: 1
backdropFocus: [50, 50]
backdropZoom: 1
restOnMood: true
---

# Arthur Thorne — portraits

The talk portrait is two layers, each placed on its own (in the game: Cmd+E, select the portrait, then **Option-drag** moves Arthur Thorne, **Option-Shift-drag** moves the background):

- **Background:** the screen behind them, cut around their click box with a 10 pixel bleed (`arthur-backdrop` on [[Arthur.canvas]]).
- **Character:** Arthur Thorne cut out of the green screen (`arthur-actor-cut`), standing in front.

`offset` and `zoom` place the character (percent of the box); `backdropFocus` and `backdropZoom` place the background. Moods and blinks come later.

## Idle
```yaml
frame: "[[arthur-talk-cut-04.webp]]"
```

## Backdrop
```yaml
image: "[[arthur-backdrop.webp]]"
```

## Talking
While they speak, these frames play (cut from `arthur-talk-cut` on their canvas). The idle frame above is one of them, so resting and talking line up.

```yaml
frameMs: 125
msPerCharacter: 55
minMs: 1200
frames:
  - "[[arthur-talk-cut-01.webp]]"
  - "[[arthur-talk-cut-04.webp]]"
  - "[[arthur-talk-cut-03.webp]]"
  - "[[arthur-talk-cut-04.webp]]"
  - "[[arthur-talk-cut-05.webp]]"
  - "[[arthur-talk-cut-06.webp]]"
  - "[[arthur-talk-cut-07.webp]]"
  - "[[arthur-talk-cut-08.webp]]"
```

## Cues
Between lines they rest on the face of their mood (`restOnMood: true` above). Made on their canvas from the resting talk frame, so the faces line up.

```yaml
neutral: "[[arthur-talk-cut-04.webp]]"
warm: "[[arthur-warm-face-cut.webp]]"
irritated: "[[arthur-irritated-face-cut.webp]]"
```
