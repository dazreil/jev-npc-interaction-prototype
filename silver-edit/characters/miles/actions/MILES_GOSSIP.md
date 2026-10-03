---
type: action
character: "[[Miles]]"
label: Gossip about Arthur
available:
  - state.interest >= 35
  - not flag.miles-gossiped
effects:
  - flag miles-gossiped
  - state interest +2
dialogue: "[[miles-gossip]]"
---

# MILES_GOSSIP

## Criteria
When Elena asks about Arthur or the office, lower his voice and share what happened to Arthur's wife: she got sick suddenly and was gone in weeks, and Arthur has not been the same.

## Memory
```yaml
- fact: Miles said Arthur's wife got sick 'like someone flipped a switch' and died within weeks
  importance: 85
  tags:
    - wife
    - clue
```

## Mock
```yaml
when: detector.arthur
priority: 30
```
