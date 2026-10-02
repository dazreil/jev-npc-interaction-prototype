---
type: event
on: action ALLOW_ENTRY
priority: 50
effects:
  - flag gate-open
  - flag company-call-pending off
  - sound unlock
  - portrait Arthur entry-granted
---

# Gate opens

Runs when Arthur picks [[ALLOW_ENTRY]]. That action also ends the talk with [[entry-granted]].

`flag gate-open` swings the two gate leaves open on [[south-gate]] (the `swing` on each leaf in [[gate-front]]). You then see the yard through the open gate.
