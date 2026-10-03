---
type: action
character: "[[Chloe]]"
label: Show a sketch
available:
  - state.excitement >= 45
  - not flag.saw-sketch
effects:
  - flag saw-sketch
  - state unease +20
dialogue: "[[chloe-show-sketch]]"
---

# CHLOE_SHOW_SKETCH

## Criteria
Shyly show Elena a page from her black notebook: a drawing of a void hung with velvet, silk ribbons like bindings, and a tall man made of shadow. She dreamed it, she thinks. It frightens her a little.

## Memory
```yaml
- fact: Chloe showed Elena a sketch of a velvet void, silk bindings, and a tall man made of shadow
  importance: 92
  tags:
    - malphas
    - seer
    - clue
```

## Mock
```yaml
when: detector.sketch
priority: 30
```
