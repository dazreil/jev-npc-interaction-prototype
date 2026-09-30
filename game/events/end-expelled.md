---
type: event
on: action
priority: 20
effects:
  - end [[expelled]]
---

# Expelled

## Also needs
```yaml
all:
  - any: [lastAction = END_CONVERSATION, counter.refusals >= 6]
  - any: [previousAction = WARN_PLAYER, state.irritation > 82]
```

He warned the player and they kept going, or he is too angry to go on.
