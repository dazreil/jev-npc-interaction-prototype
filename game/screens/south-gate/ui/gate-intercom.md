---
type: ui
title: Gate intercom panel
width: 447
height: 717
theme: "[[neon-theme]]"
---

# Gate intercom panel

The call panel on the right gate post, placed on [[World.canvas]]. The panel was generated full size with green where its video screen and label go, cut out (`intercom-unit-cut` on [[Assets.canvas]]), and shrunk onto the post. The holes are filled from behind: a dark video screen and a printed label.

## Elements
```yaml
# behind the panel: the screen and the label show through its holes
- type: rect
  id: gate-intercom-screen
  at: [99, 91, 245, 227]
  fill: ["#0f1d2e", "#030711"]
  pattern: scanlines
  children:
    - { type: text, at: [16, 12, 213, 40], style: label, size: 34, color: $cyan, text: "T04" }
    - { type: ellipse, at: [196, 180, 24, 24], fill: $magenta, glow: $magenta }
- type: rect
  id: gate-intercom-label
  at: [74, 556, 295, 92]
  fill: "#d9d2b4"
  children:
    - { type: text, at: [0, 14, 295, 64], font: $body, size: 56, color: "#1a1a1a", align: center, valign: middle, text: "PRESS TO CALL" }
# the panel itself, on top
- type: image
  id: gate-intercom-panel
  at: [0, 0, 447, 717]
  src: "[[intercom-unit-cut.webp]]"
  fit: fill
  pixelated: true
```
