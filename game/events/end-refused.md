---
type: event
on: action
priority: 10
if:
  - counter.refusals >= 6
effects:
  - end [[refused]]
---

# Refused

After 6 refusals the night is over. There are 7 different refusal lines, so the talk ends before he repeats one.

## Also ends when
```yaml
any: [lastAction = END_CONVERSATION]
```

Lowest priority: it runs only if [[end-locked-out]] and [[end-expelled]] did not.
