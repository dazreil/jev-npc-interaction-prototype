---
type: dialogue
action: "[[REFUSE_ENTRY]]"
---

# REFUSE_ENTRY — lines

## neutral
Template: {acknowledgement} {boundary}

### acknowledgement
- I understand what you're asking.
- I've heard you.
- Sorry.

### boundary
- I can't let you in without authorisation.
- That still isn't enough for me to open the gate.
- You'll need to come back when the warehouse is open.

### branch: phone / bag
```yaml
when:
  - playerContains in [phone, bag, friend, personal item]
template: "{acknowledgement} {personalBoundary}"
slots:
  acknowledgement:
    - I believe the item may be yours.
    - I understand it's inconvenient.
  personalBoundary:
    - A personal errand still doesn't justify opening a closed warehouse.
    - You'll have to retrieve it when the site reopens.
    - I can't risk the building over something left inside.
```

### branch: after ASK_FOR_REASON
```yaml
when:
  - lastAction = ASK_FOR_REASON
template: "{unansweredBoundary}"
slots:
  unansweredBoundary:
    - You haven't told me what you want. I'm keeping the gate shut.
    - If you won't tell me why you're here, I can't help you.
    - That still doesn't tell me what you want. The gate stays closed.
```

## friendly
- I'd help if I could, [[address]], but I can't risk letting you through.

## irritated
- I've already told you. You're not getting in.

## hostile
- No. You're not going through that gate.

## @pal
- No, pal. That story doesn't open this gate.
- Come on, pal. You know that isn't enough.

## @sir
- I can't open the gate on that alone, sir. You'll need to come back in the morning.
- Sorry, sir. I don't have enough to let you in.

## @mate
- I'd like to help you, mate, I really would, but I can't open the gate on that alone.
- I hear what you're saying, and I don't want to leave you stuck, but the gate has to stay shut.

## @friend
- No, friend. Not enough. Door stays shut.
- I cannot open for this. Come back tomorrow.
