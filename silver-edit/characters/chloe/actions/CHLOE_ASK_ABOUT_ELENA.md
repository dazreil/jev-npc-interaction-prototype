---
type: action
character: "[[Chloe]]"
label: Ask about Elena
effects:
  - state trust +3
acknowledgesName: true
dialogue: "[[chloe-ask-about-elena]]"
---

# CHLOE_ASK_ABOUT_ELENA

## Criteria
Ask Elena about herself: where she came from, why Blackwood, what happened to her hair.

## Mock
```yaml
when: detector.question
priority: 10
```
