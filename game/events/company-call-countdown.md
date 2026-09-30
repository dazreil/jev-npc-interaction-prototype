---
type: event
on: turn
if:
  - flag.company-call-pending
effects:
  - counter company-call-turns +1
---

# Company call countdown

After the ID is shown, Arthur waits. After 3 turns he makes the call anyway. The tree arrow `if counter.company-call-turns >= 3` then goes to `company-call`. See [[arthur-tree.canvas]].
