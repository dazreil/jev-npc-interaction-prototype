---
type: ui
title: {{title}}
width: 640
height: 360
theme: "[[neon-theme]]"
background: $screen
---

# {{title}}

## Elements
```yaml
- type: rect
  at: [20, 20, 200, 60]
  style: panel
- type: text
  at: [30, 30, 180, 40]
  style: value
  text: Hello
- type: button
  at: [20, 100, 140, 32]
  style: button
  label: OK
  do: [narrate "Clicked"]
```
