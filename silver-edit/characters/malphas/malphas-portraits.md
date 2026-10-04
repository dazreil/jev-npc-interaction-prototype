---
type: portraits
character: "[[Malphas]]"
offset: [0, 0]
zoom: 1
backdropFocus: [50, 50]
backdropZoom: 1
restOnMood: true
---

# Malphas — portraits

The talk portrait is two layers, each placed on its own (in the game: Cmd+E, select the portrait, then **Option-drag** moves Malphas, **Option-Shift-drag** moves the background):

- **Background:** the screen behind them, cut around their click box with a 10 pixel bleed (`malphas-backdrop` on [[Malphas.canvas]]).
- **Character:** Malphas cut out of the green screen (`malphas-actor-cut`), standing in front.

`offset` and `zoom` place the character (percent of the box); `backdropFocus` and `backdropZoom` place the background. Moods and blinks come later.

## Idle
```yaml
frame: "[[malphas-talk-cut-05.webp]]"
```

## Backdrop
```yaml
image: "[[malphas-backdrop.webp]]"
```

## Talking
While they speak, these frames play (cut from `malphas-talk-cut` on their canvas). The idle frame above is one of them, so resting and talking line up.

```yaml
frameMs: 125
msPerCharacter: 55
minMs: 1200
frames:
  - "[[malphas-talk-cut-01.webp]]"
  - "[[malphas-talk-cut-02.webp]]"
  - "[[malphas-talk-cut-03.webp]]"
  - "[[malphas-talk-cut-04.webp]]"
  - "[[malphas-talk-cut-05.webp]]"
  - "[[malphas-talk-cut-06.webp]]"
  - "[[malphas-talk-cut-07.webp]]"
  - "[[malphas-talk-cut-08.webp]]"
```

## Cues
Between lines they rest on the face of their mood (`restOnMood: true` above). Made on their canvas from the resting talk frame, so the faces line up.

```yaml
neutral: "[[malphas-talk-cut-05.webp]]"
cold: "[[malphas-cold-face-cut.webp]]"
```
