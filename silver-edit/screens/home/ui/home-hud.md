---
type: ui
title: Home frame
width: 640
height: 360
theme: "[[autumn-theme]]"
---

# Home frame

The frame drawn over the screen: where Elena is, and what to do.

## Elements
```yaml
- type: rect
  at:
    - 0
    - 0
    - 640
    - 34
  fill:
    - "#000000cc"
    - "#00000000"
- type: text
  at:
    - 18
    - 9
    - 420
    - 20
  style: label
  color: $amber
  text: The cottage on Larch Lane · 11:52 pm
- type: rect
  at:
    - 0
    - 326
    - 640
    - 34
  fill:
    - "#00000000"
    - "#000000cc"
- type: text
  at:
    - 18
    - 334
    - 604
    - 20
  style: label
  text: It has been a long day. Sleep.
  visible: [not var.look]
# what Elena thinks of the thing she last clicked (set by its `var look`)
- type: text
  at: [18, 328, 604, 28]
  font: $body
  size: 15
  color: $paper
  italic: true
  text: "{var.look}"
  visible: [var.look]
```
