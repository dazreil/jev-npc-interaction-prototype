---
type: object
name: Video intercom
label: VIDEO INTERCOM
key: C
ui: "[[intercom-hud]]"
panel: [262, 10, 370, 300]
conversation: "[[Arthur]]"
---

# Video intercom

An old two-way video call point on a post beside the gate. It links to Arthur in Guard Tower 04.

It is a thing **in the world**, not a screen. Its card on [[World.canvas]] puts it in the `south-gate` scene:

- Where the card sits on the picture is where the player clicks it. They can also press `C`.
- Using it runs `open intercom`. Its UI, [[intercom-hud]], opens in place over the scene, in the `panel` box. To place it by eye, drag the [[intercom-hud]] card onto the scene on the canvas. The rest of the scene dims but stays visible, so you still see the gate behind it.
- **HANG UP** on the device runs `close intercom`.

![[arthur-intercom.webp|200]]

## Talk
The call follows [[arthur-tree.canvas|Arthur's dialogue tree]].
