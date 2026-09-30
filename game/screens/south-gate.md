---
type: screen
title: Car park / South gate
width: 640
height: 360
camera: CAM 04-B / EXTERIOR
objective: Find a way past Arthur
ui: "[[gate-hud]]"
---

# South gate

**Layout lives on [[World.canvas]].** The picture, the open-gate picture, the intercom, and the way to the tower are cards in the `south-gate` group there. This note holds the screen's settings and its overlay UI.

![[gate-closed.webp]]

The first screen. The player looks at the locked gate through a security camera.

## Status
```yaml
- { label: Barrier, when: flag.gate-open, then: Open, else: Secured }
```

## Hotspots
Rects are `[x, y, width, height]` in screen pixels. The workbench hotspot tool will write this block.

The intercom and the walk to the tower are on [[World.canvas]]. The gate's Inspect / Try menu below is not drawn yet.

```yaml
- id: gate
  label: GATE
  rect: [147, 122, 346, 130]
  visible: [not flag.gate-open]
  verbs:
    Inspect: [narrate "Heavy locked leaves. Arthur controls the release from Tower 04."]
    Try gate: [narrate "Locked. You need Arthur to release it.", sound denied]
```

When the gate is open it looks like this:

![[gate-open.webp|320]]
