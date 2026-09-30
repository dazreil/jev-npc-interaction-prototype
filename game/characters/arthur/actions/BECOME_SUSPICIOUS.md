---
type: action
character: "[[Arthur]]"
label: Challenge a contradiction
available:
  - not signal.unresolved-suspicion
effects:
  - state trust -15
  - state suspicion +20
  - state irritation +10
portraitCue: suspicious
dialogue: "[[become-suspicious]]"
---

# BECOME_SUSPICIOUS

## Criteria
Challenge a newly discovered contradiction, bribe, admitted lie, evasive answer, or other sign that the player's account is unreliable. This is a one-time challenge for each unresolved suspicious incident; the action becomes unavailable until the player repairs the conversation. A new purpose that conflicts with a purpose recorded in persistent memories is a contradiction and must select BECOME_SUSPICIOUS even when REFUSE_ENTRY also seems possible.

%% Mock provider rules are still code in js/providers/mock.js (spec open question 2). %%
