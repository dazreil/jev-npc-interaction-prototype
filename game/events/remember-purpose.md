---
type: event
on: action
priority: 90
if:
  - no memory.topic in [purpose]
---

# Remember the purpose

The first time the player says why they are at the gate, Arthur remembers it, whatever action he took. Without this, a player who gave a reason on a turn that left its own memory could never reach [[ALLOW_ENTRY]]. `signal.purpose` is a built-in signal (see [[Game]]). It runs before the ending events, so they see the memory.

## Memory
```yaml
- when: signal.purpose = emergency
  fact: Player stated an emergency reason for being at the gate
  importance: 70
  tags: [emergency, claim]
  topic: purpose
  value: emergency
- when: signal.purpose = authority
  fact: Player stated an authority reason for being at the gate
  importance: 60
  tags: [authority, claim]
  topic: purpose
  value: authority
- when: signal.purpose = delivery
  fact: Player stated a delivery reason for being at the gate
  importance: 60
  tags: [delivery, claim]
  topic: purpose
  value: delivery
- when: signal.purpose = personal
  fact: Player stated a personal reason for being at the gate
  importance: 60
  tags: [personal, claim]
  topic: purpose
  value: personal
```
