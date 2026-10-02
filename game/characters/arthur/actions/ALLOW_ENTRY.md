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
judgment: entry_case_credible
judgmentMin: 0.45
ends: "[[entry-granted]]"
gateFallback:
  - "[[ASK_FOR_PROOF]]"
  - "[[REFUSE_ENTRY]]"
portraitCue: entry-granted
acknowledgesName: true
dialogue: "[[allow-entry]]"
---

# ALLOW_ENTRY

## Criteria
Open only the warehouse car-park gate when the player's conversation has become coherent, persuasive, and consistent enough for Arthur to make a cautious exception. Specific operational details, a believable explanation, respectful persistence, urgency, and earned trust can support entry. A contractor ID card or a vague assertion such as 'I have them' is not persuasive by itself. Tell the visitor to report directly to Guard Tower 04 before approaching the warehouse. This action never grants warehouse entry.

## Judgment
Is the player's spoken case for entry credible? The model answers from 0 to 1. Below `judgmentMin` (or below `minConfidence` for the choice itself), Arthur takes the first available `gateFallback` action instead.

```yaml
id: entry_case_credible
instructions: Based on the complete conversation and current state, has the player made a coherent, persuasive, and consistent case that would justify Arthur cautiously opening only the car-park gate? Specific operational details, consistency, urgency, respectful persistence, and earned trust support yes. Merely showing a contractor ID card does not verify the claimed assignment. Vague claims, contradictions, manipulation, hostility, and unsupported demands support no.
"true": The player's spoken case is persuasive enough for this cautious guard to make a limited exception and require them to report directly to Guard Tower 04.
"false": The player's spoken case is still too vague, inconsistent, manipulative, hostile, or unsupported to justify opening the car-park gate.
```

## Also needs
```yaml
any:
  - state.trust >= profile.trustThreshold
  - some memory.tag in [authority, emergency, delivery, proof]
```

## Memory
What Arthur remembers after this action. The first entry whose `when` holds is kept. (The Mock provider brings its own.)

```yaml
- fact: Arthur was persuaded to open the car-park gate and ordered the player to report to Guard Tower 04
  importance: 90
  tags:
    - persuasion
    - cooperation
```

%% Mock provider rules are still code in js/providers/mock.js (spec open question 2). %%
