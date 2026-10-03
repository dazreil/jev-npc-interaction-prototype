---
type: action
character: "[[Miles]]"
label: Wrap up
effects: []
ends: "[[miles-day-done]]"
dialogue: "[[miles-wrap-up]]"
---

# MILES_WRAP_UP

## Criteria
End the conversation when Elena leaves or it has run its course.

## Mock
```yaml
when: detector.leave
priority: 40
```
