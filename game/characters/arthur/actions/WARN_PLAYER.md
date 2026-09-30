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

%% Mock provider rules are still code in js/providers/mock.js (spec open question 2). %%
