---
type: character
name: {{title}}
role:
patience: 50
greed: 20
courage: 50
sympathy: 50
ruleFollowing: 50
trust: 20
suspicion: 40
irritation: 10
fear: 5
fallbackAction:
tree:
lines:
---

# {{title}}

## Style
How they think and talk.

## Tones
```yaml
- { tone: hostile, when: state.irritation > 70 }
- { tone: irritated, when: state.irritation > 40 }
- { tone: friendly, when: state.trust > 65 }
- { tone: neutral }
```
