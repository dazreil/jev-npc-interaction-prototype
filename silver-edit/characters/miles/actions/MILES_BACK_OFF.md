---
type: action
character: "[[Miles]]"
label: Back off
effects:
  - state interest -10
  - state charm +2
dialogue: "[[miles-back-off]]"
---

# MILES_BACK_OFF

## Criteria
When Elena makes it clear she is not interested, back off gracefully and stay friendly.

## Mock
```yaml
when: detector.rebuff
priority: 35
```
