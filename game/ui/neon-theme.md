---
type: theme
title: Neon CCTV
---

# Neon CCTV theme

Colours, fonts, and reusable styles. A UI element uses a colour as `$cyan`, and a style as `style: panel`.

## Colors
```yaml
black: "#050711"
shell: "#080c19"
panel: "#080e1d"
panel-raised: "#101b2b"
screen: "#030711"
line: "#4d9aa8"
line-dark: "#173b4b"
text: "#f1f5fa"
muted: "#9bb4c2"
cyan: "#62f7ff"
magenta: "#ff53dc"
green: "#5af8ff"
danger: "#ff68e8"
clear: "transparent"
```

## Fonts
```yaml
body: "VT323, monospace"
```

## Styles
```yaml
panel:
  fill: $panel
  stroke: $line
  strokeWidth: 1
label:
  font: $body
  size: 18
  color: $muted
  uppercase: true
  letterSpacing: 1
value:
  font: $body
  size: 18
  color: $text
hotspot:
  font: $body
  size: 14
  color: $cyan
  stroke: "#62f7ff66"
  hoverFill: "#62f7ff22"
  hoverLabel: true
button:
  font: $body
  size: 18
  color: $cyan
  image: "[[button.svg]]"
  hoverImage: "[[button-hover.svg]]"
```
