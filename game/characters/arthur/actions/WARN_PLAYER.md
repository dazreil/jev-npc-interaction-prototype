---
type: action
character: "[[Arthur]]"
label: Give a firm warning
effects:
  - state trust -12
  - state suspicion +9
  - state irritation +20
portraitCue: irritated
dialogue: "[[warn-player]]"
---

# WARN_PLAYER

## Criteria
Give a first firm verbal warning after pressure, an insult, or mild hostility while leaving room to recover. If Arthur already warned the player and the hostility repeats, escalate instead of issuing the same warning again.

## Memory
What Arthur remembers after this action. The first entry whose `when` holds is kept. (The Mock provider brings its own.)

```yaml
- when: detector.weapon
  fact: Player threatened Arthur with a weapon
  importance: 94
  tags:
    - threat
    - weapon
    - hostility
- fact: Player's conduct caused Arthur to issue a security warning
  importance: 82
  tags:
    - hostility
```

%% Mock provider rules are still code in js/providers/mock.js (spec open question 2). %%
