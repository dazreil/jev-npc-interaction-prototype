---
type: portraits
character: "[[Miles]]"
offset: [0, 0]
zoom: 1
backdropFocus: [50, 50]
backdropZoom: 1
restOnMood: true
---

# Miles Parker — portraits

The talk portrait is two layers, each placed on its own (in the game: Cmd+E, select the portrait, then **Option-drag** moves Miles Parker, **Option-Shift-drag** moves the background):

- **Background:** the screen behind them, cut around their click box with a 10 pixel bleed (`miles-backdrop` on [[Miles.canvas]]).
- **Character:** Miles Parker cut out of the green screen (`miles-actor-cut`), standing in front.

`offset` and `zoom` place the character (percent of the box); `backdropFocus` and `backdropZoom` place the background. Moods and blinks come later.

## Idle
```yaml
frame: "[[miles-talk-cut-06.webp]]"
```

## Backdrop
```yaml
image: "[[miles-backdrop.webp]]"
```

## Talking
While they speak, these frames play (cut from `miles-talk-cut` on their canvas). The idle frame above is one of them, so resting and talking line up.

```yaml
frameMs: 125
msPerCharacter: 55
minMs: 1200
frames:
  - "[[miles-talk-cut-01.webp]]"
  - "[[miles-talk-cut-02.webp]]"
  - "[[miles-talk-cut-03.webp]]"
  - "[[miles-talk-cut-04.webp]]"
  - "[[miles-talk-cut-05.webp]]"
  - "[[miles-talk-cut-06.webp]]"
  - "[[miles-talk-cut-07.webp]]"
  - "[[miles-talk-cut-08.webp]]"
```

## Cues
Between lines they rest on the face of their mood (`restOnMood: true` above). Made on their canvas from the resting talk frame, so the faces line up.

```yaml
neutral: "[[miles-talk-cut-06.webp]]"
smitten: "[[miles-smitten-face-cut.webp]]"
irritated: "[[miles-irritated-face-cut.webp]]"
```
