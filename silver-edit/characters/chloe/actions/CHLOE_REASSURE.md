---
type: action
character: "[[Chloe]]"
label: Shake it off
effects:
  - state unease -8
  - state trust +4
dialogue: "[[chloe-reassure]]"
---

# CHLOE_REASSURE

## Criteria
When Elena reassures her, relax and laugh it off, a little too brightly.

## Mock
```yaml
when: detector.sympathy
priority: 25
```
