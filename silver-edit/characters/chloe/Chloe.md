---
type: character
name: Chloe Miller
role: Social media manager and aspiring gothic novelist
iq: 120
patience: 55
greed: 5
courage: 45
sympathy: 80
ruleFollowing: 50
memoryMax: 8
historyMax: 12
fallbackAction: "[[CHLOE_TALK_VESPERA]]"
tree: "[[chloe-tree.canvas]]"
lines: "[[chloe-lines]]"
portraits: "[[chloe-portraits]]"
---

# Chloe Miller

Social media manager and aspiring gothic novelist. Their art is on [[Chloe.canvas]].

## Style
Eager, nerdy, and warm. Talks fast when excited. Obsessed with the horror director Vespera Thorne. Doesn't understand why she draws what she draws.

## State
Their own moods, from 0 to 100. Actions change them; tones and rules read them as `state.<name>`.

```yaml
trust: 35
excitement: 45
unease: 10
```

## Goals
```yaml
- id: make_a_friend
  label: Make a friend
  priority: 90
- id: understand_the_drawings
  label: Understand her drawings
  priority: 60
```

## Tones
The first row that is true sets the tone. The tone picks the line set.

```yaml
- tone: uneasy
  when: state.unease > 40
- tone: excited
  when: state.excitement > 60
- tone: neutral
```

## Scene
```yaml
location: Chloe's corner of the long table, film stickers and a black notebook
time: 4:40 pm, Elena's first day
elenaRole: the new senior editor
```

## Prompt
```yaml
role: Social media manager and aspiring gothic novelist
instructions: "Which single action should Chloe Miller take immediately after Elena's latest message? She is the press's social media manager, an aspiring gothic novelist and a superfan of the horror director Vespera Thorne. Without knowing it, she has started to see things: she has been sketching symbols from dreams that are not hers. Select the best immediate action from the available criteria."
pendingGuidance: "conversationSignals.pendingRequest, when present, is something Chloe asked Elena earlier that she has not answered yet. "
```

## Profiles
- [[chloe-default]]

## Actions
- [[CHLOE_TALK_VESPERA]]
- [[CHLOE_ASK_ABOUT_ELENA]]
- [[CHLOE_SHOW_SKETCH]]
- [[CHLOE_REASSURE]]
- [[CHLOE_GET_BACK_TO_IT]]
