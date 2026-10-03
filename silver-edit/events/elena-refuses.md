---
type: event
on: action
priority: 60
if:
  - detector.refusal
  - lastAction in [MALPHAS_PROMISE_REST, MALPHAS_FLATTER, MALPHAS_REMIND_OF_POWER, MALPHAS_COMMAND]
effects:
  - state patience -15
  - state temptation -8
---

# Elena refuses

Each time Elena refuses [[Malphas]] in the dream, his patience frays and his hold loosens. Keep refusing and **Wake up.** appears, or he lets her go.
