---
type: theme
title: Permanent autumn
---

# Permanent autumn theme

Blood-red maples, old paper, ink, and lamplight.

## Colors
```yaml
ink: "#140c0b"
panel: "#1e1412"
panel-raised: "#2a1b17"
paper: "#efe3cf"
screen: "#120a09"
line: "#b88a52"
line-dark: "#4a3326"
text: "#f3e9d8"
muted: "#c3ab8c"
blood: "#b3261e"
amber: "#e3a23b"
silver: "#d9dde3"
violet: "#9d7bff"
velvet: "#0b0710"
clear: transparent
```

## Fonts
```yaml
body: Georgia, 'Times New Roman', serif
label: Georgia, serif
```

## Styles
```yaml
panel:
  fill: $panel
  stroke: $line
  strokeWidth: 1
label:
  font: $label
  size: 15
  color: $muted
  uppercase: true
  letterSpacing: 2
value:
  font: $body
  size: 17
  color: $text
card:
  font: $body
  size: 17
  color: $paper
  italic: true
  fill: "#0d0807cc"
  padding: 6
prose:
  font: $body
  size: 17
  color: $text
hotspot:
  font: $label
  size: 15
  color: $paper
  stroke: "#e3a23b00"
  hoverFill: "#e3a23b1f"
  hoverLabel: true
exit:
  font: $label
  size: 15
  color: $amber
  fill: "#140c0bcc"
  stroke: $line
  hoverFill: "#e3a23b33"
button:
  font: $label
  size: 15
  color: $amber
  stroke: $line
  hoverFill: "#e3a23b22"
```
