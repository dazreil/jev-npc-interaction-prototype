---
type: ui
title: Gate front
width: 1280
height: 529
theme: "[[neon-theme]]"
---

# Gate front

Everything in front of the yard at the south gate, placed on [[World.canvas]]. Back to front: the brick wall either side, the two gate leaves, then the posts.

All parts are Krea 2 props cut out of a green screen (see [[Assets.canvas]]). Each right-hand part is the mirror image of the left one.

- Wall: `wall-wire-cut`, with razor wire added by Qwen edit. Cropped to fit (`fit: cover`).
- Gate leaves: `gate-leaf-krea-cut`. When `flag.gate-open` becomes true, each leaf swings toward its hinge in 6 held steps over 1.6 seconds.
- Posts: `post-no-lamp-cut`, with the lamp removed by Qwen edit.

`shade` makes each part darker, so the props match the dark yard behind them. 1 is as drawn; 0 is black.

## Elements
```yaml
- type: image
  id: wall-left
  at: [0, 79, 216, 450]
  src: "[[wall-wire-cut.webp]]"
  fit: cover
  pixelated: true
  shade: 0.5
- type: image
  id: wall-right
  at: [1064, 79, 216, 450]
  src: "[[wall-wire-cut-mirrored.webp]]"
  fit: cover
  pixelated: true
  shade: 0.5
- type: image
  id: gate-leaf-left
  at: [340, 22, 300, 487]
  src: "[[gate-leaf-krea-cut.webp]]"
  fit: fill
  pixelated: true
  shade: 0.6
  swing: { when: [flag.gate-open], hinge: left, to: 0.16, seconds: 1.6, steps: 6 }
- type: image
  id: gate-leaf-right
  at: [640, 22, 300, 487]
  src: "[[gate-leaf-krea-cut-mirrored.webp]]"
  fit: fill
  pixelated: true
  shade: 0.6
  swing: { when: [flag.gate-open], hinge: right, to: 0.16, seconds: 1.6, steps: 6 }
- type: image
  id: post-left
  at: [196, 0, 144, 509]
  src: "[[post-no-lamp-cut.webp]]"
  fit: fill
  pixelated: true
  shade: 0.5
- type: image
  id: post-right
  at: [940, 0, 144, 509]
  src: "[[post-no-lamp-cut-mirrored.webp]]"
  fit: fill
  pixelated: true
  shade: 0.5
```
