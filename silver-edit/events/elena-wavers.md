---
type: event
on: action
priority: 60
if:
  - detector.yield
  - lastAction in [MALPHAS_PROMISE_REST, MALPHAS_FLATTER, MALPHAS_REMIND_OF_POWER, MALPHAS_COMMAND]
effects:
  - state temptation +10
---

# Elena wavers

When Elena gives ground, the silk tightens.
