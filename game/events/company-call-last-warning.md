---
type: event
on: reply
if:
  - flag.company-call-pending
  - counter.company-call-turns = 2
  - lastAction != ALLOW_ENTRY
effects:
  - append company-call-warning-2
---

# Company call, last warning

On the 3rd turn after the ID, Arthur says this is the last answer before he phones. On the next turn [[arthur-tree.canvas|the tree]] goes to `company-call`.
