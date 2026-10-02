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

**Layout lives on [[World.canvas]].** The scene is built in layers in the `south-gate` group there. This note holds the screen's settings and its overlay UI ([[gate-hud]]).

![[car-park-yard.webp|320]]

The first screen. The player looks at the locked gate through a security camera. Layers, back to front:

1. The yard: guard tower, warehouse, car park (`car-park-yard`).
2. Life in the yard: Arthur on patrol and the guard dog ([[gate-yard]]).
3. The gate front: barbed-wire wall, the two gate leaves that swing open, the brick posts ([[gate-front]]).
4. The call panel on the right post ([[gate-intercom]]), and the [[intercom]] you click.

## Status
```yaml
- { label: Barrier, when: flag.gate-open, then: Open, else: Secured }
```

## Hotspots
Rects are `[x, y, width, height]` in screen pixels (640 x 360). The workbench hotspot tool will write this block.

The intercom and the walk to the tower are on [[World.canvas]]. The gate's Inspect / Try menu below is not drawn yet.

```yaml
- id: gate
  label: GATE
  rect: [170, 106, 300, 244]
  visible: [not flag.gate-open]
  verbs:
    Inspect: [narrate "Heavy locked leaves. Arthur controls the release from Tower 04."]
    Try gate: [narrate "Locked. You need Arthur to release it.", sound denied]
```
