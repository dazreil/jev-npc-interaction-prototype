---
type: dialogue
action: "[[BECOME_SUSPICIOUS]]"
---

# BECOME_SUSPICIOUS — lines

## neutral
Template: {challenge} {request}

### challenge
- Something about that doesn't add up.
- Hold on, [[address]]. Your account has changed.
- That's not the reason you gave me before.

### request
- Explain it again.
- What are you really doing here?
- Give me the honest version.

### branch: bribe / cash
```yaml
when:
  - playerContains in [bribe, cash, money, pay you, quid, reward]
template: "{challenge} {boundary}"
slots:
  challenge:
    - Offering me something makes this look worse.
    - You don't buy your way through this gate.
  boundary:
    - Keep your money and explain why you're really here.
    - Try to bribe me again and we're done.
```

## friendly
- Maybe I've misunderstood, but your story isn't quite lining up.

## irritated
- Now you're changing your story. What are you really doing here?

## hostile
- I knew it. You've been lying to me.

## @pal
- Hold it, pal. That's not the story you gave me.
- Come on. Now you're changing it. What's really going on?

## @sir
- Hold on, sir. That's not what you told me a moment ago. Which version is true?
- Your story's changed. Tell me plainly what's going on.

## @mate
- Hold on now, mate. That's not quite what you told me before, and I need to know which version I'm meant to believe.
- You've lost me there. The story changed halfway through, so talk me through what really happened.

## @friend
Template: {challenge}

### challenge
- Story changed. Which one is true?
- No. Before you say different. Tell truth now.

### branch: letter from the king / from the king
```yaml
when:
  - playerContains in [letter from the king, from the king]
template: Letter from king? No jokes. Tell me who actually sent you and why.
```
