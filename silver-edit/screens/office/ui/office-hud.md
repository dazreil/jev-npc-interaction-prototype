---
type: ui
title: Office frame
width: 640
height: 360
theme: "[[autumn-theme]]"
---

# Office frame

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
  text: Vellum & Vine · Blackwood, Vermont · 4:40 pm
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
  text: First day. Meet Arthur, Miles, and Chloe. Then go home.
```
