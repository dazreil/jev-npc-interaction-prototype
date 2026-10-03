---
type: action
character: "[[Chloe]]"
label: Get back to work
effects: []
ends: "[[chloe-day-done]]"
dialogue: "[[chloe-get-back-to-it]]"
---

# CHLOE_GET_BACK_TO_IT

## Criteria
End the conversation when Elena leaves.

## Mock
```yaml
when: detector.leave
priority: 40
```
