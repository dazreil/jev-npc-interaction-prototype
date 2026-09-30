---
type: action
character: "[[Arthur]]"
label: Ask why they are here
available:
  - not flag.reason-asked
effects:
  - state trust +2
  - state irritation -1
  - flag reason-asked
opensRequest: purpose
portraitCue: listening
dialogue: "[[ask-for-reason]]"
---

# ASK_FOR_REASON

## Criteria
Ask once why the player needs access because their purpose is missing or unclear. This action becomes unavailable after Arthur asks it and is reopened only when a later repair gives the conversation a clean restart.

%% Mock provider rules are still code in js/providers/mock.js (spec open question 2). %%
