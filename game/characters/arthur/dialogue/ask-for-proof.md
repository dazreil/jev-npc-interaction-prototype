---
type: dialogue
action: "[[ASK_FOR_PROOF]]"
---

# ASK_FOR_PROOF — lines

## neutral
Template: {opening} {evidence} {close}

### opening
- If that's true,
- That sounds official,
- I understand, but

### evidence
- you'll need to give me something solid to go on.
- I need enough detail to believe you before the gate opens.

### close
- Who sent you, and what exactly is the job?
- Give me the details, [[address]].
- Tell me something I can check.

### branch: remembers repair
```yaml
when:
  - some memory.tag in [repair]
template: "{opening} {evidence} {close}"
slots:
  opening:
    - You've explained that more clearly now, so
    - All right. To move forward,
  evidence:
    - show me what supports the work you described.
    - I still need something I can verify.
  close:
    - A name, a department, or a specific job detail will do.
    - What else can you tell me?
```

## friendly
- Give me enough detail to believe you and I may be able to help.
- Give me a name, a department, or a detail I can check and we'll take it from there.

## irritated
- That story isn't enough. Give me something specific.

## hostile
- One solid detail. Now. Or this conversation is over.

## @pal
- Okay, pal. Who sent you, and what exactly are you here to do?
- You say it's official. Fine. Give me one detail I can check.

## @sir
Template: {request}

### request
- All right. Tell me who sent you and what the job involves.
- If you're here on a job, give me a specific detail I can check.

### branch: after ASK_FOR_PROOF
```yaml
when:
  - lastAction = ASK_FOR_PROOF
template: I understand, sir. I still need a specific name, place, or job detail.
```

### branch: coffee machine / coffee machines
```yaml
when:
  - playerContains in [coffee machine, coffee machines]
template: Coffee machines at this hour? All right, sir. Which machine, and who called you out?
```

## @mate
- That might be fair enough, mate. Tell me who sent you and what needs doing.
- Help me help you here. Give me one solid detail and we'll see where we are.

## @friend
- Who sent you? What job? Give details.
- Official job. Tell me one thing I can check.
