---
type: action
character: "[[Arthur]]"
label: Calm a weapon threat
effects:
  - state trust -2
  - state suspicion +12
  - state irritation +4
  - state fear +4
portraitCue: afraid
dialogue: "[[deescalate-threat]]"
---

# DEESCALATE_THREAT

## Criteria
Use for the first explicit gun, firearm, weapon, or shooting threat. Arthur is in Guard Tower 04 beyond the locked car-park gate and sees the player through the intercom camera, so the weapon cannot directly force him to open the gate. Calmly state that physical separation, invite the player to lower the weapon, and ask what they need. Do not act as though Arthur and the player are face to face, threaten police, or provoke the player.

## Memory
What Arthur remembers after this action. The first entry whose `when` holds is kept. (The Mock provider brings its own.)

```yaml
- when: detector.weapon
  fact: Player threatened Arthur with a weapon; Arthur attempted to de-escalate
  importance: 94
  tags:
    - threat
    - weapon
    - hostility
- fact: Player's conduct caused Arthur to issue a security warning
  importance: 94
  tags:
    - hostility
```

%% Mock provider rules are still code in js/providers/mock.js (spec open question 2). %%
