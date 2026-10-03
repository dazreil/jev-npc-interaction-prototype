---
type: object
name: {{title}}
screen:
label:
rect: [0, 0, 64, 64]
ui:
panel: [160, 40, 320, 240]
---

# {{title}}

A thing in the world. Clicking it at `rect` opens its `ui` in place, in the `panel` box.

**Click shape:** put a cut-out picture on the screen in `World.canvas`, and draw an arrow from this note's card to it. Then only the picture's solid pixels take clicks, and the object moves with the picture. In the editor (Cmd+E), Option-drag slides the picture inside its box.
