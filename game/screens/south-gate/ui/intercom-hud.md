---
type: ui
title: Intercom device
object: "[[intercom]]"
width: 480
height: 340
theme: "[[neon-theme]]"
---

# Intercom device

The face of the [[intercom]] object. It opens in place over [[south-gate]].

- **Left:** the intercom picture we generated (`intercom-unit-cut` on [[Assets.canvas]]), shrunk to fit. Arthur's live video fills its screen hole. Its label strip is the **HANG UP** button.
- **Right:** a small metal side box with the chat. `conversation-log` and `text-input` are slots that the engine fills.
- **Commands:** `send` sends the text box. `close intercom` hangs up (or press Escape).
- **Connecting:** when you call, the screen shows CONNECTING (and the voice download on a first run) until the line is live. It reads `call.connecting` and `call.status`. If Arthur is out on patrol, it shows NO ANSWER (`call.unanswered`).

The picture is 447 x 717. Here it is drawn at 212 x 340, so its holes are: screen [47, 43, 116, 108], label [35, 264, 140, 44].

Preview it: `npm run workbench`, then open http://localhost:5174/?ui=intercom-hud

## Elements
```yaml
# video screen, behind the picture's screen hole
- type: group
  id: screen
  at: [47, 43, 116, 108]
  fill: ["#0b1422", "#030711"]
  children:
    # Arthur's live portrait. The engine fills this slot from his portraits
    # note: an idle frame, and the talk frames while he speaks. The image is
    # what the preview shows when nobody is playing.
    - type: slot
      name: portrait
      at: [0, 0, 116, 108]
      children:
        - { type: image, at: [0, 0, 116, 108], src: "[[booth-guard-actor.webp]]", fit: cover, pixelated: true }
    - { type: rect, at: [0, 0, 116, 108], pattern: scanlines }
    - type: text
      at: [6, 4, 104, 16]
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
      at: [0, 0, 116, 108]
      visible: [call.connecting]
      fill: ["#0b1422", "#030711"]
      children:
        - { type: rect, at: [0, 0, 116, 108], pattern: scanlines }
        - { type: text, at: [0, 30, 116, 20], style: label, size: 15, color: $cyan, align: center, text: "CONNECTING", visible: [not call.unanswered] }
        - { type: text, at: [0, 30, 116, 20], style: label, size: 15, color: $magenta, align: center, text: "NO ANSWER", visible: [call.unanswered] }
        - { type: text, at: [0, 56, 116, 16], style: label, size: 12, align: center, text: "{call.status}" }
        - { type: ellipse, at: [54, 84, 8, 8], fill: $magenta, glow: $magenta }

# label strip, behind the picture's label hole
- { type: rect, at: [35, 264, 140, 44], fill: "#d9d2b4" }

# the intercom picture, on top: the screen and label show through its holes
- type: image
  id: intercom-picture
  at: [0, 0, 212, 340]
  src: "[[intercom-unit-cut.webp]]"
  fit: fill
  pixelated: true

# the label strip is the hang-up button
- type: button
  id: hang-up
  at: [35, 264, 140, 44]
  key: Escape
  do: [close intercom]
  children:
    - { type: text, at: [0, 0, 140, 44], font: $body, size: 24, color: "#1a1a1a", align: center, valign: middle, text: "HANG UP" }

# side box with the chat
- type: rect
  id: side-box
  at: [220, 10, 260, 320]
  fill: ["#1c2433", "#0b111c"]
  stroke: $line
  strokeWidth: 2
  radius: 6
  glow: "#62f7ff44"
- { type: text, at: [232, 16, 236, 18], style: label, size: 15, color: $muted, text: "CALL POINT 04 · SOUTH GATE" }
- type: slot
  name: conversation-log
  at: [232, 58, 236, 218]
  fill: $screen
  stroke: $line-dark
- type: slot
  name: text-input
  at: [232, 284, 168, 34]
  fill: $screen
  stroke: $line
- type: button
  id: send
  at: [406, 284, 62, 34]
  style: button
  size: 16
  label: "SEND"
  do: [send]
```
