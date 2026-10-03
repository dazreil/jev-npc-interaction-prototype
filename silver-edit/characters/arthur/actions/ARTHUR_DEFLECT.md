---
type: action
character: "[[Arthur]]"
label: Deflect a personal question
effects:
  - state irritation +6
  - state warmth -2
dialogue: "[[arthur-deflect]]"
---

# ARTHUR_DEFLECT

## Criteria
Shut down a personal question about his life, grief, or late wife, politely but firmly, when Elena has not earned that yet.

## Mock
```yaml
when: detector.personal
priority: 25
```
