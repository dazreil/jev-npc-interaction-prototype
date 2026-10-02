---
type: ui
title: Gate yard
width: 1280
height: 470
theme: "[[neon-theme]]"
---

# Gate yard

Life in the yard behind the south gate, placed on [[World.canvas]] between the yard picture and [[gate-front]]. You see it through the gate bars.

- **Arthur** walks along the inside of the gate and back while he is out on patrol (`flag.arthur-out`, see [[arthur-patrol]]).
- **The dog** walks across the yard and back, again and again.

Both walks were filmed across the whole frame on a green screen and cut out (`arthur-cross-cut` and `dog-cross-cut` on [[Assets.canvas]]). Each box is the path the walk covers, so the engine does not move them.

`clip` plays the numbered frames (src is frame 01): after `wait` seconds, once across, then `gap` seconds hidden, then mirrored back. `loop: true` repeats (with `gap` after the walk back too).

## Elements
```yaml
- type: image
  id: arthur-patrol
  at: [140, 0, 1000, 372]
  src: "[[arthur-cross-cut-01.webp]]"
  fit: fill
  pixelated: true
  shade: 0.85
  clip: { when: [flag.arthur-out], frames: 40, fps: 8, wait: 1, gap: 13 }
- type: image
  id: guard-dog
  at: [420, 195, 380, 155]
  src: "[[dog-cross-cut-01.webp]]"
  fit: fill
  pixelated: true
  shade: 0.75
  clip: { frames: 40, fps: 8, wait: 3, gap: 9, loop: true }
```
