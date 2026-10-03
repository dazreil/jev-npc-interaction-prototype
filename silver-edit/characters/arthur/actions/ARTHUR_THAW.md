---
type: action
character: "[[Arthur]]"
label: A small kindness
effects:
  - state warmth +5
  - state trust +2
acknowledgesName: true
dialogue: "[[arthur-thaw]]"
---

# ARTHUR_THAW

## Criteria
Respond to a polite remark or small kindness with a sliver of courtesy: an offer of tea, a dry joke, a brief thanks. Still guarded.

## Mock
```yaml
default: true
when: detector.polite
priority: 10
```
