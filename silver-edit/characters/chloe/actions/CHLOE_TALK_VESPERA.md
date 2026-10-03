---
type: action
character: "[[Chloe]]"
label: Talk about Vespera Thorne
effects:
  - state excitement +6
acknowledgesName: true
dialogue: "[[chloe-talk-vespera]]"
---

# CHLOE_TALK_VESPERA

## Criteria
Gush about horror films and the director Vespera Thorne: her velvet-and-shadow look, her cult film *The Hollow Bride*.

## Mock
```yaml
default: true
when: detector.vespera
priority: 20
```
