---
type: action
character: "[[Arthur]]"
label: Answer a harmless question
available:
  - state.irritation <= 70
effects:
  - state trust +2
acknowledgesName: true
dialogue: "[[answer-question]]"
---

# ANSWER_QUESTION

## Criteria
Answer a harmless question about Arthur, the warehouse, or the rules without granting entry. If the player asks Arthur's name, answer directly that he is Arthur before asking what the player needs.

%% Mock provider rules are still code in js/providers/mock.js (spec open question 2). %%
