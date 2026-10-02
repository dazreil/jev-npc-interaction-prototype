---
type: game
title: Jev NPC — South Gate
startScreen: "[[south-gate]]"
world: "[[World.canvas]]"
theme: "[[neon-theme]]"
startItems:
  - "[[contractor-id]]"
seed: player-address
providers:
  - mock
  - jev
---

# Game

The player stands outside a locked warehouse car-park gate at night. Arthur, the night guard, watches from Guard Tower 04 over a video intercom.

## Variables
```yaml
flags: [gate-open, reason-asked, company-call-pending, arthur-out]
counters: { refusals: 0, support-requests: 0, company-call-turns: 0 }
```

## Built-in signals
These come from code, not patterns. Conditions test them as `signal.<name>`.

| Signal | Meaning |
| --- | --- |
| `message-effort` | `terse` or `considered`. Terse: trust −1, irritation +2. |
| `player-name` | A name the player gave ("call me Sam"). |
| `name-question` | The player asked Arthur's name. |
| `unresolved-suspicion` | Arthur raised a suspicion that is not repaired yet. |
| `tension-raised` | Suspicion is 8+ or irritation 12+ above his start. |
| `pending-request` | Something Arthur asked that the player still owes him. |
| `purpose` | The player's stated reason: emergency, authority, delivery, or personal. |

## Endings
- [[entry-granted]]
- [[refused]]
- [[expelled]]
- [[locked-out]]
- [[exposed]]
