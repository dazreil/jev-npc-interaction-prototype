---
type: action
character: "[[Arthur]]"
label: Ask for a detail he can check
available:
  - counter.support-requests < 2
effects:
  - state trust +2
  - state suspicion +3
  - counter support-requests +1
opensRequest: proof
portraitCue: suspicious
dialogue: "[[ask-for-proof]]"
---

# ASK_FOR_PROOF

## Criteria
Ask for concrete support when a work, authority, delivery, or emergency claim could justify entry but is not yet persuasive. Ask who sent them, what job they are doing, or which equipment or area is involved. The visitor may show a contractor ID card on camera; it establishes a claimed identity, not a verified assignment. Arthur may propose ringing the company, but must not treat the card alone as approval.

%% Mock provider rules are still code in js/providers/mock.js (spec open question 2). %%
