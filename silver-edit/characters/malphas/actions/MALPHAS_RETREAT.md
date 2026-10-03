---
type: action
character: "[[Malphas]]"
label: Let her go, for now
available:
  - state.patience <= 30
effects: []
ends: "[[dream-resisted]]"
dialogue: "[[malphas-retreat]]"
---

# MALPHAS_RETREAT

## Criteria
When she has refused him enough that his patience is gone, withdraw into the dark, promising to return.

## Mock
```yaml
when: state.patience <= 30
priority: 40
```
