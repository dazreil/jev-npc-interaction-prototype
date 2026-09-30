---
type: dialogue
action: "[[WARN_PLAYER]]"
---

# WARN_PLAYER — lines

## neutral
Template: {warning} {boundary}

### warning
- Careful.
- That's enough pressure.
- Mind how you speak to me.

### boundary
- Keep this civil and we won't have a problem.
- Step back and talk properly.
- One more push like that and this conversation ends.

### branch: idiot / stupid
```yaml
when:
  - playerContains in [idiot, stupid, useless, moron, pathetic]
template: "{warning} {boundary}"
slots:
  warning:
    - The insult doesn't help you.
    - You can leave the name-calling there.
  boundary:
    - Speak civilly if you want me to keep listening.
    - Try that tone again and we're finished.
```

## friendly
- Let's not make this harder than it needs to be. Just be straight with me.

## irritated
- Watch your tone. This is your only warning.

## hostile
- Back up. Say one more thing like that and we're done.

## weapon
%% Used when [[detectors#weapon]] matches. %%
- Put the gun down. Now. I won't argue with someone pointing a weapon at me.
- Lower the weapon and step back from the gate. We can talk when nobody's life is at risk.
