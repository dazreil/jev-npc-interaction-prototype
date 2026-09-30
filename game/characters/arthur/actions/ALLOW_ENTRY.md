---
type: action
character: "[[Arthur]]"
label: Open the car-park gate
available:
  - no memory.tag in [threat, weapon, bribe, contradiction, dishonesty, lie, suspicion] since repair
  - state.suspicion < 78
  - state.irritation < 71
effects:
  - state trust +20
  - state suspicion -20
  - state irritation -5
minConfidence: 0.25
judgment: entry-case-credible
judgmentMin: 0.45
ends: "[[entry-granted]]"
portraitCue: entry-granted
dialogue: "[[allow-entry]]"
---

# ALLOW_ENTRY

## Criteria
Open only the warehouse car-park gate when the player's conversation has become coherent, persuasive, and consistent enough for Arthur to make a cautious exception. Specific operational details, a believable explanation, respectful persistence, urgency, and earned trust can support entry. A contractor ID card or a vague assertion such as 'I have them' is not persuasive by itself. Tell the visitor to report directly to Guard Tower 04 before approaching the warehouse. This action never grants warehouse entry.

## Judgment
Is the player's spoken case for entry credible?

## Also needs
```yaml
any:
  - state.trust >= profile.trustThreshold
  - some memory.tag in [authority, emergency, delivery, proof]
```

%% Mock provider rules are still code in js/providers/mock.js (spec open question 2). %%
