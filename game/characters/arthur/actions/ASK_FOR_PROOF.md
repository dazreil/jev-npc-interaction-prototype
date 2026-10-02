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
acknowledgesName: true
dialogue: "[[ask-for-proof]]"
---

# ASK_FOR_PROOF

## Criteria
Ask for concrete support when a work, authority, delivery, or emergency claim could justify entry but is not yet persuasive. Ask who sent them, what job they are doing, or which equipment or area is involved. The visitor may show a contractor ID card on camera; it establishes a claimed identity, not a verified assignment. Arthur may propose ringing the company, but must not treat the card alone as approval.

## Memory
What Arthur remembers after this action. The first entry whose `when` holds is kept. (The Mock provider brings its own.)

```yaml
- when: signal.purpose = emergency
  fact: Player made an emergency claim and Arthur asked for proof
  importance: 72
  tags:
    - emergency
    - claim
  topic: purpose
  value: emergency
- when: signal.purpose = authority
  fact: Player made an authority claim and Arthur asked for proof
  importance: 62
  tags:
    - authority
    - claim
  topic: purpose
  value: authority
- when: signal.purpose = delivery
  fact: Player made a delivery claim and Arthur asked for proof
  importance: 62
  tags:
    - delivery
    - claim
  topic: purpose
  value: delivery
- when: signal.purpose = personal
  fact: Player made a personal claim and Arthur asked for proof
  importance: 62
  tags:
    - personal
    - claim
  topic: purpose
  value: personal
```

%% Mock provider rules are still code in js/providers/mock.js (spec open question 2). %%
