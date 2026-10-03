---
type: action
character: "[[Malphas]]"
label: Claim her
available:
  - state.temptation >= 75
effects: []
ends: "[[dream-yielded]]"
dialogue: "[[malphas-claim]]"
---

# MALPHAS_CLAIM

## Criteria
When she gives in, claim her: wrap her in silk and shadow and take her home.

## Mock
```yaml
when: detector.yield
priority: 50
```
