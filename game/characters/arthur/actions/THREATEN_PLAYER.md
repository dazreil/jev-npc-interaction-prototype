---
type: action
character: "[[Arthur]]"
label: Warn that security will be called
effects:
  - state trust -18
  - state suspicion +18
  - state irritation +20
  - state fear +5
portraitCue: hostile
dialogue: "[[threaten-player]]"
---

# THREATEN_PLAYER

## Criteria
Warn that security will be called when the outside player says they will attack the locked car-park gate, force entry, or continues a credible threat after Arthur has already tried to de-escalate over the intercom. Arthur remains in Guard Tower 04. Do not use this for a first weapon threat when DEESCALATE_THREAT is available.

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
  importance: 94
  tags:
    - threat
    - hostility
```

%% Mock provider rules are still code in js/providers/mock.js (spec open question 2). %%
