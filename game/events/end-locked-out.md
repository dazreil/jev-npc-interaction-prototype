---
type: event
on: action
priority: 30
effects:
  - end [[locked-out]]
---

# Locked out

## Also needs
```yaml
all:
  - any: [lastAction = END_CONVERSATION, counter.refusals >= 6]
  - any:
      - some memory.tag in [threat, weapon, trespass] since repair
      - state.suspicion > 91
```

Locked out beats [[end-expelled]], so it has the higher priority. Today this is `resolveTerminalOutcome()` in `js/game.js`.
