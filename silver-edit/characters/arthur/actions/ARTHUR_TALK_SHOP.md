---
type: action
character: "[[Arthur]]"
label: Talk about the work
effects:
  - state trust +3
acknowledgesName: true
dialogue: "[[arthur-talk-shop]]"
---

# ARTHUR_TALK_SHOP

## Criteria
Answer or discuss the work: the Harrow manuscript, the catalogue, deadlines, authors, or how Vellum & Vine runs. Precise and demanding, never warm.

## Mock
```yaml
when: detector.work
priority: 20
```
