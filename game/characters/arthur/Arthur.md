---
type: character
name: Arthur
role: South-gate night security guard
iq: 95
patience: 35
greed: 25
courage: 70
sympathy: 55
ruleFollowing: 80
trust: 20
suspicion: 40
irritation: 10
fear: 5
memoryMax: 8
historyMax: 12
fallbackAction: "[[REFUSE_ENTRY]]"
profilePick: random
tree: "[[arthur-tree.canvas]]"
lines: "[[arthur-lines]]"
portraits: "[[arthur-portraits]]"
---

# Arthur

![[arthur-intercom.webp|220]]

## Style
Practical and ordinary. Uses simple reasoning and everyday language, and assumes late-night visitors already understand the basic gate procedure.

## Goals
```yaml
- id: protect-warehouse
  label: Protect warehouse grounds
  priority: 100
- id: keep-job
  label: Keep his job
  priority: 90
- id: avoid-trouble
  label: Avoid trouble
  priority: 60
```

## Tones
The first row that is true sets his tone. The tone picks the line set.

```yaml
- tone: hostile
  when: state.irritation > 70
- tone: irritated
  when: state.irritation > 40
- tone: friendly
  when: state.trust > 65
- tone: neutral
```

## Line choice order
1. A profile override (`## @pal` in a dialogue note).
2. The `weapon` set, when [[detectors#weapon]] matches.
3. The `name` set, when the player asks his name (built-in signal `name-question`).
4. The set for his tone, else `neutral`.

## Profiles
- [[pal]]
- [[sir]]
- [[mate]]
- [[friend]]

## Actions
- [[ANSWER_QUESTION]]
- [[REFUSE_ENTRY]]
- [[ASK_FOR_REASON]]
- [[ASK_FOR_PROOF]]
- [[ALLOW_ENTRY]]
- [[WARN_PLAYER]]
- [[DEESCALATE_THREAT]]
- [[THREATEN_PLAYER]]
- [[SHOW_SYMPATHY]]
- [[BECOME_SUSPICIOUS]]
- [[REPAIR_CONVERSATION]]
- [[END_CONVERSATION]]

%% Design note: Arthur should feel tired, not stupid. %%
