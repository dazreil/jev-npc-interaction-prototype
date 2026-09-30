---
type: ui
title: Intercom device
object: "[[intercom]]"
width: 370
height: 300
theme: "[[neon-theme]]"
---

# Intercom device

The face of the [[intercom]] object: a metal call point with a small video screen, a speaker grille, and a keypad strip. It opens in place over [[south-gate]].

- **Images:** Arthur's FMV portrait in a nine-slice frame. It is the `portrait` slot, so he moves while he talks.
- **Primitives:** the housing (gradient rect), screws (ellipses), the grille (lines), the lamp, and the send arrow (polygon).
- **Slots:** `conversation-log` and `text-input` are filled by the engine.
- **Commands:** `send` sends the text box. `close intercom` hangs up.
- **Connecting:** when you call, the screen shows CONNECTING (and the voice download on a first run) until the line is live. It reads `call.connecting` and `call.status`.

Preview it: `npm run workbench`, then open http://localhost:5174/?ui=intercom-hud

## Elements
```yaml
# housing
- type: rect
  id: housing
  at: [0, 0, 370, 300]
  fill: ["#1c2433", "#0b111c"]
  stroke: $line
  strokeWidth: 2
  radius: 8
  glow: "#62f7ff44"
- { type: ellipse, at: [8, 8, 8, 8], fill: "#3a4658" }
- { type: ellipse, at: [354, 8, 8, 8], fill: "#3a4658" }
- { type: ellipse, at: [8, 284, 8, 8], fill: "#3a4658" }
- { type: ellipse, at: [354, 284, 8, 8], fill: "#3a4658" }

# name plate and hang-up
- { type: text, at: [24, 8, 230, 20], style: label, size: 16, color: $muted, text: "CALL POINT 04 · SOUTH GATE" }
- { type: ellipse, id: lamp, at: [262, 13, 8, 8], fill: $cyan, glow: $cyan }
- type: button
  id: hang-up
  at: [278, 6, 80, 22]
  style: button
  size: 15
  label: HANG UP
  key: Escape
  do: [close intercom]

# video screen
- type: nine-slice
  id: screen-frame
  at: [16, 34, 150, 118]
  src: "[[panel-frame.svg]]"
  slice: 14
  border: 8
  children:
    # Arthur's live portrait. The engine fills this slot from his portraits
    # note: an idle frame, and the talk frames while he speaks. The image is
    # what the preview shows when nobody is playing.
    - type: slot
      name: portrait
      at: [8, 8, 134, 102]
      children:
        - { type: image, at: [0, 0, 134, 102], src: "[[booth-guard-actor.webp]]", fit: cover, pixelated: true }
    - { type: rect, at: [8, 8, 134, 102], pattern: scanlines }
    - type: text
      at: [12, 10, 120, 16]
      style: label
      size: 14
      color: $cyan
      text: "T04 / LIVE"
      visible: [not call.connecting]
    # While the call connects (and the voice loads on a first run), the
    # screen shows CONNECTING instead of Arthur. The engine sets
    # call.connecting and call.status.
    - type: group
      id: connecting
      at: [8, 8, 134, 102]
      visible: [call.connecting]
      fill: ["#0b1422", "#030711"]
      children:
        - { type: rect, at: [0, 0, 134, 102], pattern: scanlines }
        - { type: line, from: [0, 51], to: [134, 51], stroke: "#62f7ff33" }
        - { type: text, at: [0, 30, 134, 20], style: label, size: 16, color: $cyan, align: center, text: "CONNECTING" }
        - { type: text, at: [0, 58, 134, 16], style: label, size: 13, align: center, text: "{call.status}" }
        - { type: ellipse, at: [63, 82, 8, 8], fill: $magenta, glow: $magenta }

# speaker grille
- type: group
  id: grille
  at: [182, 38, 172, 58]
  children:
    - { type: line, from: [0, 4], to: [172, 4], stroke: "#3a4658", strokeWidth: 3 }
    - { type: line, from: [0, 14], to: [172, 14], stroke: "#3a4658", strokeWidth: 3 }
    - { type: line, from: [0, 24], to: [172, 24], stroke: "#3a4658", strokeWidth: 3 }
    - { type: line, from: [0, 34], to: [172, 34], stroke: "#3a4658", strokeWidth: 3 }
    - { type: line, from: [0, 44], to: [172, 44], stroke: "#3a4658", strokeWidth: 3 }
    - { type: line, from: [0, 54], to: [172, 54], stroke: "#3a4658", strokeWidth: 3 }
- { type: text, at: [182, 104, 172, 44], style: label, size: 15, text: "{profile.label}" }

# conversation
- type: slot
  name: conversation-log
  at: [16, 160, 338, 90]
  fill: $screen
  stroke: $line-dark
- type: slot
  name: text-input
  at: [16, 258, 262, 30]
  fill: $screen
  stroke: $line
- type: button
  id: send
  at: [284, 258, 70, 30]
  style: button
  size: 16
  label: "SEND"
  do: [send]
  children:
    - type: polygon
      points: [[52, 10], [62, 15], [52, 20]]
      fill: $cyan
```
