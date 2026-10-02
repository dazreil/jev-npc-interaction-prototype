---
type: event
on: action
priority: 10
effects:
  - end [[refused]]
---

# Refused

Arthur ends the talk, or he has refused 6 times. After 6 refusals the night is over. There are 7 different refusal lines, so the talk ends before he repeats one.

## Also needs
```yaml
any: [lastAction = END_CONVERSATION, counter.refusals >= 6]
```

Lowest priority: it runs only if [[end-locked-out]] and [[end-expelled]] did not.
