---
type: event
on: reply
if:
  - flag.company-call-pending
  - counter.company-call-turns = 1
  - lastAction != ALLOW_ENTRY
effects:
  - append company-call-warning-1
---

# Company call warning

While Arthur waits to ring the company, he reminds the player on the 2nd turn after the ID. `append` adds a line from [[arthur-lines]] to the end of what he says. `on: reply` runs after his line is picked, before the turn's effects.

See also [[company-call-last-warning]] and [[company-call-countdown]].
