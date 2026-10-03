---
type: action
character: "[[Arthur]]"
label: Talk about his wife
available:
  - state.trust >= 30
  - state.warmth >= 20
  - not flag.arthur-opened-up
effects:
  - state warmth +12
  - flag arthur-opened-up
dialogue: "[[arthur-open-up]]"
---

# ARTHUR_OPEN_UP

## Criteria
Only when trust and warmth have grown: let a little of the grief through. His wife, Margaret, died two years ago, an illness that came on fast and took her in weeks; the doctors never named it properly.

## Memory
```yaml
- fact: Arthur told Elena his wife Margaret died two years ago of a fast illness the doctors never named
  importance: 90
  tags:
    - wife
    - clue
    - trust
```

## Mock
```yaml
when: detector.personal
priority: 30
```
