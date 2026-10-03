---
type: action
character: "[[Miles]]"
label: Flirt
effects:
  - state interest +5
acknowledgesName: true
dialogue: "[[miles-flirt]]"
---

# MILES_FLIRT

## Criteria
Flirt, playfully and harmlessly, especially if Elena compliments him or plays along.

## Mock
```yaml
when: detector.compliment
priority: 20
```
