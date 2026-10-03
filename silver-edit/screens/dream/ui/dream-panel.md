---
type: ui
title: Dream panel
width: 560
height: 320
theme: "[[autumn-theme]]"
---

# Dream panel

The panel that opens when Elena talks to someone. One panel serves every character: it shows whoever she is talking to (`{speaker}`). The engine fills the slots: their portrait, the conversation, the text box, and the **choices** (quoted arrows in their dialogue tree).

**Step away** closes it (`close` with no name closes whatever is open).

## Elements
```yaml
- type: rect
  id: back
  at:
    - 0
    - 0
    - 560
    - 320
  fill:
    - "#140a1f"
    - "#050208"
  stroke: "#6c4fb0"
  strokeWidth: 1
  radius: 4
- type: rect
  id: portrait-frame
  at:
    - 16
    - 16
    - 190
    - 236
  fill: "#030104"
  stroke: "#6c4fb0"
  strokeWidth: 1
- type: slot
  name: portrait
  at:
    - 20
    - 20
    - 182
    - 228
  children:
    - type: text
      at:
        - 0
        - 90
        - 182
        - 40
      font: $body
      size: 40
      color: "#2a1b3d"
      align: center
      text: "{speaker}"
- type: text
  id: name
  at:
    - 16
    - 258
    - 190
    - 22
  style: label
  color: $violet
  align: center
  text: "{speaker}"
- type: slot
  name: conversation-log
  at:
    - 222
    - 16
    - 322
    - 150
  fill: "#07030c"
  stroke: $line-dark
- type: slot
  name: choices
  at:
    - 222
    - 172
    - 322
    - 96
- type: slot
  name: text-input
  at:
    - 222
    - 276
    - 252
    - 30
  fill: "#07030c"
  stroke: $line
- type: button
  id: send
  at:
    - 480
    - 276
    - 64
    - 30
  style: button
  label: SAY
  do:
    - send
- type: button
  id: step-away
  at:
    - 16
    - 286
    - 190
    - 22
  style: button
  label: TURN AWAY
  key: Escape
  do:
    - close
```
