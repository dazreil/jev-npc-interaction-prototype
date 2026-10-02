---
type: action
character: "[[Arthur]]"
label: Show sympathy
available:
  - state.irritation <= 70
effects:
  - state trust +7
  - state suspicion -2
  - state irritation -5
portraitCue: friendly
acknowledgesName: true
dialogue: "[[show-sympathy]]"
---

# SHOW_SYMPATHY

## Criteria
Acknowledge the player's distress or respectful appeal while continuing to protect the warehouse.

%% Mock provider rules are still code in js/providers/mock.js (spec open question 2). %%
