---
type: action
character: "[[Arthur]]"
label: Send her back to work
effects: []
ends: "[[arthur-day-done]]"
dialogue: "[[arthur-dismiss]]"
---

# ARTHUR_DISMISS

## Criteria
End the conversation: send Elena back to her desk, or let her go when she leaves.

## Mock
```yaml
when: detector.leave
priority: 40
```
