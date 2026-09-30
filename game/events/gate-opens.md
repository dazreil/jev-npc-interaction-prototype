---
type: event
on: action ALLOW_ENTRY
priority: 50
effects:
  - flag gate-open
  - sound unlock
  - portrait Arthur entry-granted
---

# Gate opens

Runs when Arthur picks [[ALLOW_ENTRY]]. That action also ends the talk with [[entry-granted]].

## Effects
```yaml
- animate: { screen: "[[south-gate]]", layer: gate, play: opening, then: open }
```

![[gate-opening.webp|320]]
