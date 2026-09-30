---
type: action
character: "[[Arthur]]"
label: Accept an apology or clarification
effects:
  - state trust +10
  - state suspicion -14
  - state irritation -12
  - state fear -4
  - flag reason-asked off
  - counter support-requests = 0
portraitCue: friendly
dialogue: "[[repair-conversation]]"
---

# REPAIR_CONVERSATION

## Criteria
Use when the player apologizes, acknowledges an insult, threat, lie, bribe, or contradiction, or responds to Arthur's suspicion with evidence or a clarification consistent with their original purpose. Accept the repair cautiously, lower Arthur's suspicion and irritation, and invite one concrete next step. Do not use this for a generic polite request with no prior damage.

## Also needs
```yaml
any:
  - signal.unresolved-suspicion
  - some memory.tag in [threat, weapon, bribe, contradiction, dishonesty, lie, suspicion] since repair
  - signal.tension-raised
```

%% Mock provider rules are still code in js/providers/mock.js (spec open question 2). %%
