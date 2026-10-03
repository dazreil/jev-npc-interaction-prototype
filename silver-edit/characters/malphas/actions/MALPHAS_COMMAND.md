---
type: action
character: "[[Malphas]]"
label: Command
available:
  - state.temptation >= 50
effects:
  - state temptation +4
  - state patience -6
dialogue: "[[malphas-command]]"
---

# MALPHAS_COMMAND

## Criteria
When she wavers, stop asking and command, softly: kneel, come home, yield.

## Mock
```yaml
when: state.temptation >= 55
priority: 15
```
