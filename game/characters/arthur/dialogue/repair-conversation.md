---
type: dialogue
action: "[[REPAIR_CONVERSATION]]"
---

# REPAIR_CONVERSATION — lines

## neutral
Template: {acknowledgement} {nextStep}

### acknowledgement
- All right, [[address]]. I hear you.
- Thank you for saying that.

### nextStep
- Tell me what you actually need and we'll go from there.
- Fine. Say what happened, straight.

### branch: after BECOME_SUSPICIOUS
```yaml
when:
  - lastAction = BECOME_SUSPICIOUS
template: "{acknowledgement} {boundary} {nextStep}"
slots:
  acknowledgement:
    - All right, [[address]]. I hear you.
    - Thank you for being honest.
  boundary:
    - I'm still not sure I believe you.
    - That story still doesn't add up.
  nextStep:
    - So tell me what really brought you here.
    - Tell me the truth about why you're here.
```

### branch: sorry / apolog
```yaml
when:
  - playerContains in [sorry, apolog, my bad, out of order, shouldn't have, shouldnt have, didn't mean, didnt mean, no offence, no offense]
  - lastAction = WARN_PLAYER
template: "{acknowledgement} {boundary} {nextStep}"
slots:
  acknowledgement:
    - I appreciate the apology.
    - All right, [[address]]. Apology heard.
  boundary:
    - Keep it civil and we can continue.
    - Let's leave the shouting there.
  nextStep:
    - What is it you need from the warehouse?
    - Explain what brought you here.
```

### branch: after WARN_PLAYER
```yaml
when:
  - lastAction = WARN_PLAYER
template: "{acknowledgement} {boundary} {nextStep}"
slots:
  acknowledgement:
    - All right, [[address]]. I hear you.
    - Understood.
  boundary:
    - Keep it civil and we can continue.
    - Let's leave the shouting there.
  nextStep:
    - What is it you need from the warehouse?
    - Explain what brought you here.
```

## friendly
- I appreciate the honesty. Tell me what you actually need.
- All right. Say it straight and I'll hear you out.

## irritated
- That helps, but it doesn't wipe out what happened. Tell me the truth.
- You've got one chance. What are you really here for?

## hostile
Template: I hear you. Keep your distance and explain yourself carefully.

### branch: sorry / apolog
```yaml
when:
  - playerContains in [sorry, apolog, my bad, out of order, shouldn't have, shouldnt have, didn't mean, didnt mean, no offence, no offense]
templates:
  - I hear the apology. Keep your distance and explain yourself carefully.
```

## @pal
Template: All right, pal, I hear you. Now give it to me straight.
Template: Fine. Let's start again and you tell me what you need.

### branch: sorry / apolog
```yaml
when:
  - playerContains in [sorry, apolog, my bad, out of order, shouldn't have, shouldnt have, didn't mean, didnt mean, no offence, no offense]
templates:
  - All right, pal, apology heard. Now give it to me straight.
  - Apology taken, pal. Now give it to me straight.
```

## @sir
Template: All right, sir. Let's start again. Tell me what actually happened.
Template: Okay. We can keep talking, but I need the straight story from here.

### branch: sorry / apolog
```yaml
when:
  - playerContains in [sorry, apolog, my bad, out of order, shouldn't have, shouldnt have, didn't mean, didnt mean, no offence, no offense]
templates:
  - All right, sir. I appreciate the apology. Tell me what actually happened.
  - Apology noted, sir. Now tell me what actually happened.
```

## @mate
Template: Fair enough, mate. Let's keep it straight from here and tell me what you actually need.
Template: All right, mate. Start again and tell me what you're after.

### branch: sorry / apolog
```yaml
when:
  - playerContains in [sorry, apolog, my bad, out of order, shouldn't have, shouldnt have, didn't mean, didnt mean, no offence, no offense]
templates:
  - Fair enough, mate, apology accepted. Let's keep it straight from here and tell me what you actually need.
  - Apology accepted, mate. Now tell me what you actually need.
```

## @friend
- Good. We speak straight now. What you need?
- Apology accepted, friend. No more games.
