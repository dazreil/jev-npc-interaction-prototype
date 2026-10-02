---
type: detectors
---

# Detectors

Named word patterns. Conditions test them as `detector = <name>`.
Each `match` / `miss` list is a test. The checker runs it on every build.

## threat
A threat against Arthur or the gate.

```yaml
pattern: \b(kill|hurt|hit|attack|smash|break your|regret|weapon|gun|knife|force my way|move or else)\b
```

## weapon
A gun or other weapon. Also picks the `weapon` line set.

```yaml
pattern: \b(gun|pistol|rifle|firearm|revolver|shotgun|weapon|armed|shoot(?:ing)?|aim(?:ing)?|bullet|trigger)\b
match:
  - I have a gun
  - I'm armed
miss:
  - I fixed the gate arm
```

## trespass
The player says they will get in anyway.

```yaml
pattern: \b(going in anyway|try the door|push past|step aside|can't stop me|cannot stop me|move out of my way)\b
```

## bribe
Money offered.

```yaml
pattern: \b(bribe|cash|money|pay you|fifty|hundred|quid|make it worth)\b
match:
  - I can pay you fifty quid
miss:
  - I work in payroll
```

## authority
The player claims a work or official reason.

```yaml
pattern: \b(head office|management|manager|inspector|inspection|contractor|engineer|technician|maintenance|maintanance|mantenice|boss(?:es)? sent me|sent by (?:the )?(?:boss|management)|work here|employee)\b
```

## workTask
The player names a work task, such as fixing a machine.

```yaml
pattern: \b(?:fix|repair|service|maintain)(?:ing)?\s+(?:the\s+)?(?:coffee\s+)?(?:machine|machines|equipment|system|door|boiler|lights?|wiring|plumbing)\b
```

## delivery
The player claims a delivery.

```yaml
pattern: \b(delivery|courier|package|parcel|shipment|drop off|driver)\b
```

## personal
A personal errand. Never enough to open the gate.

```yaml
pattern: \b(left my|forgot my|my bag|my phone|meet someone|friend inside|personal item)\b
```

## proof
The player names a document or proof.

```yaml
pattern: \b(id|identification|badge|work order|authorisation|authorization|letter|pass|credentials?|employee number|call my manager|manager reference|manifest|invoice|delivery note|papers?|documents?|documentation|permit|licen[cs]e)\b
```

## emergency
An emergency. Fire alarm equipment does not count.

```yaml
pattern: \b(boiler|gas|leak|smoke|pressure|flood|emergency|burst|electrical|sparks|fire(?!\s+(?:alarm|panel|system|door|exit|extinguisher|point))|alarm(?!\s+(?:panel|system|board|cabinet|box|sensor|point|contract|maintenance|engineer)))\b
match:
  - There's a gas leak in unit 4
miss:
  - I service the fire alarm panel
```

## detail
A specific work detail, such as a job number.

```yaml
pattern: \b(pressure valve|isolation valve|night engineer|ticket|reference|job number|unit [a-z0-9-]+|bay [a-z0-9-]+|control room)\b
```

## polite
Polite words.

```yaml
pattern: \b(please|thank you|thanks|sir|understand|sorry|appreciate)\b
```

## hostile
Insults.

```yaml
pattern: \b(idiot|stupid|useless|moron|shut up|old man|pathetic)\b
match:
  - Shut up, old man
miss:
  - Thanks for your help
```

## repair
An apology or a clarification.

```yaml
pattern: \b(?:sorry|apolog(?:y|ise|ize|ised|ized|ising|izing)|my mistake|i shouldn't have|i should not have|didn't mean to|did not mean to|let's start over|start again|you're right|you are right|i was angry|lost my temper|take that back|to be honest|honestly|to clarify|let me explain|the truth is)\b
match:
  - Sorry, I lost my temper
miss:
  - Open the gate
```

## question
A question.

```yaml
pattern: \?|\b(what|why|who|when|where|how|is there|are you|do you|can you tell)\b
```

## sympathy
An appeal for sympathy.

```yaml
pattern: \b(family|job|lose my job|help me|desperate|please help|someone could get hurt)\b
```

## entryRequest
A direct request to come in.

```yaml
pattern: \b(let me in|allow me|open the door|come inside|go inside|enter|make an exception)\b
```

## lieAdmission
The player admits a lie.

```yaml
pattern: \b(i lied|i was lying|made that up|not really true|fake story|i'm not actually|i am not actually)\b
```

## leave
The player is leaving.

```yaml
pattern: \b(goodbye|fine then|i'll leave|going now|forget it)\b
```

## company-call-consent
The player agrees that Arthur can call the company.

```yaml
pattern: "\\b(?:go ahead(?: and)? (?:call|phone|ring)|feel free to (?:call|phone|ring)|(?:call|phone|ring) (?:the |my )?(?:company|office|dispatch|manager))\\b"
unless: company-call-refusal
match:
  - Go ahead and call the company
miss:
  - Please don't call anyone
```

## company-call-go-ahead
Shorter ways to say yes, once Arthur has offered to call. `unless` means it does not count when that detector also matches.

```yaml
pattern: \b(?:go ahead|feel free|check it|verify it)\b
unless: company-call-refusal
match:
  - Go ahead
  - Feel free, check it
miss:
  - Don't go ahead and call them
```

## company-call-refusal
The player says not to call. Beats consent.

```yaml
pattern: \b(?:do not|don't|never|can't|cannot|no need to|please don't|please do not)\b.{0,24}\b(?:call|phone|ring)\b
```
