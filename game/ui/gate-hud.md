---
type: ui
title: Gate camera
screen: "[[south-gate]]"
width: 640
height: 360
theme: "[[neon-theme]]"
---

# Gate camera HUD

The camera overlay for [[south-gate]]. The gate pictures are placed on [[World.canvas]]. This note is only the overlay, made of **primitives**: corner brackets (lines), a REC dot (ellipse), and a status strip (rect + text).

The [[intercom]] is an in-world object on this screen. The engine adds its hotspot, and opens its UI here when used. The **Show ID** button appears only while the intercom is open, because the player holds the card up to its camera.

Preview it live: `npm run workbench`, then open http://localhost:5174/?ui=gate-hud

## Elements
```yaml
- type: rect
  id: scanlines
  at: [0, 0, 640, 360]
  pattern: scanlines

# camera corner brackets
- { type: line, from: [12, 40], to: [12, 12], stroke: $cyan, strokeWidth: 2, glow: $cyan }
- { type: line, from: [12, 12], to: [40, 12], stroke: $cyan, strokeWidth: 2, glow: $cyan }
- { type: line, from: [600, 12], to: [628, 12], stroke: $cyan, strokeWidth: 2, glow: $cyan }
- { type: line, from: [628, 12], to: [628, 40], stroke: $cyan, strokeWidth: 2, glow: $cyan }
- { type: line, from: [12, 280], to: [12, 308], stroke: $cyan, strokeWidth: 2, glow: $cyan }
- { type: line, from: [628, 280], to: [628, 308], stroke: $cyan, strokeWidth: 2, glow: $cyan }

- type: text
  id: camera-label
  at: [22, 16, 260, 22]
  style: label
  color: $cyan
  text: "CAM 04-B / EXTERIOR"
- type: ellipse
  id: rec-dot
  at: [566, 21, 10, 10]
  fill: $magenta
  glow: $magenta
- type: text
  at: [580, 16, 44, 22]
  style: label
  color: $magenta
  text: REC

- type: rect
  id: status-strip
  at: [0, 318, 640, 42]
  fill: ["#080e1dcc", "#030711"]
  children:
    - { type: line, from: [0, 0], to: [640, 0], stroke: $line-dark }
    - { type: text, at: [16, 10, 80, 22], style: label, text: Barrier }
    - type: text
      at: [96, 10, 120, 22]
      style: value
      color: "$danger"
      text: SECURED
      visible: [not flag.gate-open]
    - type: text
      at: [96, 10, 120, 22]
      style: value
      color: $cyan
      text: OPEN
      visible: [flag.gate-open]
    - { type: text, at: [200, 10, 80, 22], style: label, text: Objective }
    - type: text
      at: [280, 10, 210, 22]
      style: value
      text: "{flag.gate-open ? Proceed to Guard Tower 04 : Find a way past Arthur}"

- type: button
  id: show-id
  at: [500, 322, 128, 28]
  style: button
  size: 16
  label: "▣ SHOW ID  [I]"
  key: I
  layer: top
  visible: [open.intercom]
  disabled: [item.contractor-id = shown]
  do: [item contractor-id shown]
```
