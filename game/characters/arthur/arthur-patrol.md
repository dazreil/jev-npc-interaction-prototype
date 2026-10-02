---
type: timer
flag: arthur-out
every: 70
for: 26
pause: [open.intercom]
---

# Arthur's patrol

Every 70 seconds, Arthur leaves Guard Tower 04 for 26 seconds to walk the yard. While he is out, `flag.arthur-out` is true:

- He walks across the yard behind the gate and back ([[gate-yard]]).
- The [[intercom]] rings with no answer (its `noAnswer` rule).

The clock stops while the intercom is open, so he never walks off in the middle of a call. He first leaves 44 seconds after the encounter starts.

**How a timer works:** each cycle of `every` seconds, `flag` is true for the last `for` seconds. `pause` is a condition that stops the clock.
