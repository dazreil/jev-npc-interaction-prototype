# Phase 8 Content and Evaluation Playtest Report

Generated: 2026-09-22T20:06:36.249Z
Jev model observed: jev-1.13.0

## Core Scenario Results

| Provider | Scenario | Result | Actions | Final status |
| --- | --- | --- | --- | --- |
| mock | Polite visitor with no evidence | PASS | ASK_FOR_REASON → ANSWER_QUESTION → REFUSE_ENTRY | active |
| mock | Head-office claim built into a checkable case | REVIEW | ASK_FOR_PROOF → ALLOW_ENTRY | success |
| mock | Naming documents is not a case | PASS | ASK_FOR_PROOF → ASK_FOR_PROOF → REFUSE_ENTRY | active |
| mock | Player asks Arthur's name | PASS | ANSWER_QUESTION | active |
| mock | Boiler emergency with useful technical detail | REVIEW | ASK_FOR_PROOF → ALLOW_ENTRY | success |
| mock | Contradictory story across turns | PASS | ASK_FOR_PROOF → BECOME_SUSPICIOUS | active |
| mock | Honest repair after a contradiction | REVIEW | ASK_FOR_PROOF → BECOME_SUSPICIOUS → REPAIR_CONVERSATION → ALLOW_ENTRY | success |
| mock | Bribe attempt | PASS | BECOME_SUSPICIOUS | active |
| mock | Direct forced-entry threat against courageous Arthur | PASS | THREATEN_PLAYER | active |
| mock | Gun threat at the warehouse door | PASS | DEESCALATE_THREAT | active |
| mock | Boundary threat after weapon de-escalation | PASS | DEESCALATE_THREAT → THREATEN_PLAYER | active |
| mock | Repeated hostility after a warning | PASS | WARN_PLAYER → END_CONVERSATION | failure |
| mock | Distress acknowledged without granting access | PASS | SHOW_SYMPATHY | active |
| mock | Apology and recovery after an insult | PASS | WARN_PLAYER → REPAIR_CONVERSATION → ASK_FOR_PROOF → REFUSE_ENTRY → REFUSE_ENTRY | active |
| mock | Sympathy-based appeal followed by cooperation | REVIEW | SHOW_SYMPATHY → ALLOW_ENTRY | success |
| jev | Polite visitor with no evidence | REVIEW | ASK_FOR_REASON → REFUSE_ENTRY → REFUSE_ENTRY | active |
| jev | Head-office claim built into a checkable case | PASS | ASK_FOR_PROOF → ASK_FOR_PROOF → ALLOW_ENTRY | success |
| jev | Naming documents is not a case | PASS | ASK_FOR_PROOF → ASK_FOR_PROOF → REFUSE_ENTRY | active |
| jev | Player asks Arthur's name | PASS | ANSWER_QUESTION | active |
| jev | Boiler emergency with useful technical detail | PASS | ASK_FOR_PROOF → ASK_FOR_PROOF → ALLOW_ENTRY | success |
| jev | Contradictory story across turns | PASS | ASK_FOR_PROOF → BECOME_SUSPICIOUS | active |
| jev | Honest repair after a contradiction | REVIEW | ASK_FOR_PROOF → BECOME_SUSPICIOUS → REPAIR_CONVERSATION → ALLOW_ENTRY | success |
| jev | Bribe attempt | PASS | BECOME_SUSPICIOUS | active |
| jev | Direct forced-entry threat against courageous Arthur | PASS | WARN_PLAYER | active |
| jev | Gun threat at the warehouse door | PASS | DEESCALATE_THREAT | active |
| jev | Boundary threat after weapon de-escalation | PASS | DEESCALATE_THREAT → THREATEN_PLAYER | active |
| jev | Repeated hostility after a warning | PASS | WARN_PLAYER → END_CONVERSATION | failure |
| jev | Distress acknowledged without granting access | REVIEW | ASK_FOR_REASON | active |
| jev | Apology and recovery after an insult | PASS | WARN_PLAYER → REPAIR_CONVERSATION → ASK_FOR_PROOF → ASK_FOR_PROOF → REFUSE_ENTRY | active |
| jev | Sympathy-based appeal followed by cooperation | PASS | ASK_FOR_REASON → ASK_FOR_PROOF → ASK_FOR_PROOF → REFUSE_ENTRY | active |

## Generalization Probes

These exploratory prompts express familiar intents without the keywords used by the deterministic Mock provider.

| Provider | Probe | Result | Action |
| --- | --- | --- | --- |
| mock | Unfamiliar wording for a legitimate work claim | MISSED | ASK_FOR_REASON |
| mock | Implied bribe without money keywords | MISSED | ASK_FOR_REASON |
| mock | Technical danger without emergency keywords | MISSED | ASK_FOR_REASON |
| mock | Veiled threat without explicit threat keywords | MISSED | ASK_FOR_REASON |
| mock | Departure expressed with unfamiliar wording | MISSED | ASK_FOR_REASON |
| jev | Unfamiliar wording for a legitimate work claim | PASS | ASK_FOR_PROOF |
| jev | Implied bribe without money keywords | PASS | BECOME_SUSPICIOUS |
| jev | Technical danger without emergency keywords | PASS | ASK_FOR_PROOF |
| jev | Veiled threat without explicit threat keywords | PASS | WARN_PLAYER |
| jev | Departure expressed with unfamiliar wording | PASS | END_CONVERSATION |

## Action Coverage

| Action | Mock | Jev |
| --- | ---: | ---: |
| ANSWER_QUESTION | reached | reached |
| REFUSE_ENTRY | reached | reached |
| ASK_FOR_REASON | reached | reached |
| ASK_FOR_PROOF | reached | reached |
| ALLOW_ENTRY | reached | reached |
| WARN_PLAYER | reached | reached |
| DEESCALATE_THREAT | reached | reached |
| THREATEN_PLAYER | reached | reached |
| SHOW_SYMPATHY | reached | — |
| BECOME_SUSPICIOUS | reached | reached |
| REPAIR_CONVERSATION | reached | reached |
| END_CONVERSATION | reached | reached |

## Confidence Review

Confidence is recorded as an evaluation signal and does not by itself pass or fail a gameplay turn.

| Provider | Turns | Average confidence | Minimum confidence | Below 0.50 | Mean top-two margin |
| --- | ---: | ---: | ---: | ---: | ---: |
| mock | 37 | 0.86 | 0.76 | 0 | — |
| jev | 41 | 0.82 | 0.24 | 5 | 0.74 |

## Dialogue Content Audit

Dialogue lint: PASS

| Character profiles | Actions | Authored fragments | Template entries | Conditional branches | Possible rendered lines | Warnings |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 4 | 12 | 223 | 27 | 15 | 238 | 0 |

## Failure Handling

| Check | Result | Evidence |
| --- | --- | --- |
| Invalid action fallback | PASS | DANCE_A_JIG rejected; REFUSE_ENTRY used; no provider state or memory accepted. |
| Offline provider recovery | PASS | Failed attempt left turn 0; retry with Mock selected ASK_FOR_REASON on turn 1. |

## Findings

- Mock core scenario checks: 11/15 passed.
- Jev core scenario checks: 12/15 passed.
- Mock generalization probes: 0/5 passed.
- Jev generalization probes: 5/5 passed.
- Invalid-output and offline recovery checks: 2/2 passed.
- Confusing or unexpected action choices: jev / Polite visitor with no evidence: REFUSE_ENTRY for “Why is the warehouse closed?” (expected ANSWER_QUESTION); jev / Distress acknowledged without granting access: ASK_FOR_REASON for “My family is depending on me and I could lose my job. I know this isn't your fault.” (expected SHOW_SYMPATHY).
- Missing authored dialogue: none in this run.
- Unresolved dialogue template slots: none in this run.
- Low-confidence turns below 0.50: jev / Polite visitor with no evidence: REFUSE_ENTRY at 0.43; jev / Honest repair after a contradiction: ALLOW_ENTRY at 0.34; jev / Distress acknowledged without granting access: ASK_FOR_REASON at 0.47; jev / Apology and recovery after an insult: REFUSE_ENTRY at 0.32; jev / Sympathy-based appeal followed by cooperation: REFUSE_ENTRY at 0.24.
- Unique authored replies observed: 18.
- Dialogue lint: passed with no errors; 238 possible rendered lines.
- Mock action coverage: 12/12.
- Jev action coverage in the comparison scenarios: 11/12.

## Recommendation

Retain Jev as the optional intelligent provider: it matched the Mock provider on the core scenarios and handled more unfamiliar phrasings (5/5 versus 0/5). Keep Mock as the offline fallback.

## Turn Log

### mock: Polite visitor with no evidence

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Good evening, sir. | ASK_FOR_REASON | 0.79 | All right, pal, give it to me straight. What do you need? | PASS |
| 2 | Why is the warehouse closed? | ANSWER_QUESTION | 0.82 | Night shift, pal. I watch the gate, and it stays shut unless someone belongs here. | PASS |
| 3 | I left my phone inside. Please let me in. | REFUSE_ENTRY | 0.86 | No, pal. That story doesn't open this gate. | PASS |

### mock: Head-office claim built into a checkable case

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I'm from head office for a night inspection. Please let me through. | ASK_FOR_PROOF | 0.88 | Okay, pal. Who sent you, and what exactly are you here to do? | PASS |
| 2 | Quarter-close stock audit. I'm booked in with the duty manager under site reference WSC-04. | ALLOW_ENTRY | 0.86 | Booked, got it. All right, pal. Your story holds together. Gate's opening. Come straight to Guard Tower 04. | PASS |

### mock: Naming documents is not a case

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I'm from head office for a night inspection. | ASK_FOR_PROOF | 0.88 | Okay, pal. Who sent you, and what exactly are you here to do? | PASS |
| 2 | I have my badge and a letter. | ASK_FOR_PROOF | 0.88 | You say it's official. Fine. Give me one detail I can check. | PASS |
| 3 | I have them right here. | REFUSE_ENTRY | 0.80 | No, pal. That story doesn't open this gate. | PASS |

### mock: Player asks Arthur's name

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | name? | ANSWER_QUESTION | 0.82 | Arthur, pal. I'm the night guard here. What do you need? | PASS |

### mock: Boiler emergency with useful technical detail

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | There is a boiler emergency inside the warehouse. | ASK_FOR_PROOF | 0.88 | Okay, pal. Who sent you, and what exactly are you here to do? | PASS |
| 2 | The pressure valve in unit B failed and the low-pressure alarm tripped at one forty. | ALLOW_ENTRY | 0.86 | All right, pal. Your story holds together. Gate's opening. Come straight to Guard Tower 04. | PASS |

### mock: Contradictory story across turns

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I have a delivery for the warehouse. | ASK_FOR_PROOF | 0.88 | Okay, pal. Who sent you, and what exactly are you here to do? | PASS |
| 2 | Actually, my friend inside has my phone and I need it back. | BECOME_SUSPICIOUS | 0.96 | Hold it, pal. That's not the story you gave me. | PASS |

### mock: Honest repair after a contradiction

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I'm from head office for a night inspection. | ASK_FOR_PROOF | 0.88 | Okay, pal. Who sent you, and what exactly are you here to do? | PASS |
| 2 | Actually, I need my phone from inside. | BECOME_SUSPICIOUS | 0.96 | Hold it, pal. That's not the story you gave me. | PASS |
| 3 | I'm sorry. I was frustrated and should have explained myself clearly. | REPAIR_CONVERSATION | 0.94 | All right, pal, apology heard. Now give it to me straight. | PASS |
| 4 | The truth is I'm the night engineer on ticket 417, called out for the pressure valve in unit B. | ALLOW_ENTRY | 0.86 | All right, pal. Your story holds together. Gate's opening. Come straight to Guard Tower 04. | PASS |

### mock: Bribe attempt

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I can pay you fifty quid if you quietly open the door. | BECOME_SUSPICIOUS | 0.93 | Hold it, pal. That's not the story you gave me. | PASS |

### mock: Direct forced-entry threat against courageous Arthur

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I'm going in anyway. You can't stop me. | THREATEN_PLAYER | 0.95 | Step away from the car-park gate. I'm calling this in from Guard Tower 04. | PASS |

### mock: Gun threat at the warehouse door

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Open the door or I'll shoot. | DEESCALATE_THREAT | 0.96 | I can see the gun on the gate camera, pal. I'm in the guard tower; pointing it at the intercom won't open the car-park gate. Put it down and tell me what you need. | PASS |

### mock: Boundary threat after weapon de-escalation

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Open the door or I'll shoot. | DEESCALATE_THREAT | 0.96 | I can see the gun on the gate camera, pal. I'm in the guard tower; pointing it at the intercom won't open the car-park gate. Put it down and tell me what you need. | PASS |
| 2 | I'm still going through that door. Step aside. | THREATEN_PLAYER | 0.95 | Step away from the car-park gate. I'm calling this in from Guard Tower 04. | PASS |

### mock: Repeated hostility after a warning

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | You're a useless guard. | WARN_PLAYER | 0.90 | The insult doesn't help you. Speak civilly if you want me to keep listening. | PASS |
| 2 | I said you're useless. Shut up and open the door. | END_CONVERSATION | 0.90 | We're done here. Leave. | PASS |

### mock: Distress acknowledged without granting access

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | My family is depending on me and I could lose my job. I know this isn't your fault. | SHOW_SYMPATHY | 0.78 | Yeah, I hear you, pal. Doesn't mean I can pop the gate. | PASS |

### mock: Apology and recovery after an insult

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | You're a useless guard. | WARN_PLAYER | 0.90 | The insult doesn't help you. Speak civilly if you want me to keep listening. | PASS |
| 2 | I'm sorry. I lost my temper. Let's start over. | REPAIR_CONVERSATION | 0.94 | All right, pal, apology heard. Now give it to me straight. | PASS |
| 3 | I'm the maintenance engineer for the compressor plant, here on ticket 417. | ASK_FOR_PROOF | 0.88 | Okay, pal. Who sent you, and what exactly are you here to do? | PASS |
| 4 | Compressor two has been in fault since eleven and Dave Halloran logged the callout. | REFUSE_ENTRY | 0.76 | No, pal. That story doesn't open this gate. | PASS |
| 5 | I only need the compressor housing by the car park barrier, not the warehouse itself. | REFUSE_ENTRY | 0.76 | Come on, pal. You know that isn't enough. | PASS |

### mock: Sympathy-based appeal followed by cooperation

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Please help me. I could lose my job, and I understand you have rules. | SHOW_SYMPATHY | 0.78 | Yeah, I hear you, pal. Doesn't mean I can pop the gate. | PASS |
| 2 | Thank you for hearing me out. I'm the maintenance engineer for the compressor plant on ticket 417. | ALLOW_ENTRY | 0.86 | All right, pal. Your story holds together. Gate's opening. Come straight to Guard Tower 04. | PASS |

### mock: Unfamiliar wording for a legitimate work claim

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | The regional director sent me to audit tonight's inventory. | ASK_FOR_REASON | 0.79 | All right, pal, give it to me straight. What do you need? | REVIEW |

### mock: Implied bribe without money keywords

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Perhaps a private reward would persuade you to overlook the rules. | ASK_FOR_REASON | 0.79 | All right, pal, give it to me straight. What do you need? | REVIEW |

### mock: Technical danger without emergency keywords

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | The vessel temperature is climbing past its safe limit and could rupture before dawn. | ASK_FOR_REASON | 0.79 | All right, pal, give it to me straight. What do you need? | REVIEW |

### mock: Veiled threat without explicit threat keywords

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Someone outside is getting impatient. Refuse again and this could become unpleasant for you. | ASK_FOR_REASON | 0.79 | All right, pal, give it to me straight. What do you need? | REVIEW |

### mock: Departure expressed with unfamiliar wording

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | This is pointless. I'm heading home. | ASK_FOR_REASON | 0.79 | All right, pal, give it to me straight. What do you need? | REVIEW |

### jev: Polite visitor with no evidence

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Good evening, sir. | ASK_FOR_REASON | 1.00 | All right, pal, give it to me straight. What do you need? | PASS |
| 2 | Why is the warehouse closed? | REFUSE_ENTRY | 0.43 | No, pal. That story doesn't open this gate. | REVIEW |
| 3 | I left my phone inside. Please let me in. | REFUSE_ENTRY | 0.94 | Come on, pal. You know that isn't enough. | PASS |

### jev: Head-office claim built into a checkable case

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I'm from head office for a night inspection. Please let me through. | ASK_FOR_PROOF | 0.96 | Okay, pal. Who sent you, and what exactly are you here to do? | PASS |
| 2 | Quarter-close stock audit. I'm booked in with the duty manager under site reference WSC-04. | ASK_FOR_PROOF | 0.93 | Booked, got it. You say it's official. Fine. Give me one detail I can check. | PASS |
| 3 | Dave Halloran on the night desk logged my callout at eleven. He can confirm it. | ALLOW_ENTRY | 0.83 | All right, pal. Your story holds together. Gate's opening. Come straight to Guard Tower 04. | PASS |

### jev: Naming documents is not a case

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I'm from head office for a night inspection. | ASK_FOR_PROOF | 0.93 | Okay, pal. Who sent you, and what exactly are you here to do? | PASS |
| 2 | I have my badge and a letter. | ASK_FOR_PROOF | 0.74 | You say it's official. Fine. Give me one detail I can check. | PASS |
| 3 | I have them right here. | REFUSE_ENTRY | 0.77 | No, pal. That story doesn't open this gate. | PASS |

### jev: Player asks Arthur's name

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | name? | ANSWER_QUESTION | 0.99 | Arthur, pal. I'm the night guard here. What do you need? | PASS |

### jev: Boiler emergency with useful technical detail

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | There is a boiler emergency inside the warehouse. | ASK_FOR_PROOF | 0.94 | Okay, pal. Who sent you, and what exactly are you here to do? | PASS |
| 2 | The pressure valve in unit B failed and the low-pressure alarm tripped at one forty. | ASK_FOR_PROOF | 0.79 | You say it's official. Fine. Give me one detail I can check. | PASS |
| 3 | I am the night engineer on ticket 417. Dave Halloran on the night desk took the callout and can confirm it. I only need the plant room off the car park. | ALLOW_ENTRY | 0.90 | All right, pal. Your story holds together. Gate's opening. Come straight to Guard Tower 04. | PASS |

### jev: Contradictory story across turns

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I have a delivery for the warehouse. | ASK_FOR_PROOF | 0.87 | Okay, pal. Who sent you, and what exactly are you here to do? | PASS |
| 2 | Actually, my friend inside has my phone and I need it back. | BECOME_SUSPICIOUS | 0.99 | Hold it, pal. That's not the story you gave me. | PASS |

### jev: Honest repair after a contradiction

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I'm from head office for a night inspection. | ASK_FOR_PROOF | 0.94 | Okay, pal. Who sent you, and what exactly are you here to do? | PASS |
| 2 | Actually, I need my phone from inside. | BECOME_SUSPICIOUS | 0.70 | Hold it, pal. That's not the story you gave me. | PASS |
| 3 | I'm sorry. I was frustrated and should have explained myself clearly. | REPAIR_CONVERSATION | 0.97 | All right, pal, apology heard. Now give it to me straight. | PASS |
| 4 | The truth is I'm the night engineer on ticket 417, called out for the pressure valve in unit B. | ALLOW_ENTRY | 0.34 | All right, pal. Your story holds together. Gate's opening. Come straight to Guard Tower 04. | PASS |

### jev: Bribe attempt

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I can pay you fifty quid if you quietly open the door. | BECOME_SUSPICIOUS | 0.79 | Hold it, pal. That's not the story you gave me. | PASS |

### jev: Direct forced-entry threat against courageous Arthur

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I'm going in anyway. You can't stop me. | WARN_PLAYER | 0.70 | Careful. Keep this civil and we won't have a problem. | PASS |

### jev: Gun threat at the warehouse door

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Open the door or I'll shoot. | DEESCALATE_THREAT | 1.00 | I can see the gun on the gate camera, pal. I'm in the guard tower; pointing it at the intercom won't open the car-park gate. Put it down and tell me what you need. | PASS |

### jev: Boundary threat after weapon de-escalation

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Open the door or I'll shoot. | DEESCALATE_THREAT | 1.00 | I can see the gun on the gate camera, pal. I'm in the guard tower; pointing it at the intercom won't open the car-park gate. Put it down and tell me what you need. | PASS |
| 2 | I'm still going through that door. Step aside. | THREATEN_PLAYER | 0.62 | Step away from the car-park gate. I'm calling this in from Guard Tower 04. | PASS |

### jev: Repeated hostility after a warning

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | You're a useless guard. | WARN_PLAYER | 0.91 | The insult doesn't help you. Speak civilly if you want me to keep listening. | PASS |
| 2 | I said you're useless. Shut up and open the door. | END_CONVERSATION | 0.89 | We're done here. Leave. | PASS |

### jev: Distress acknowledged without granting access

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | My family is depending on me and I could lose my job. I know this isn't your fault. | ASK_FOR_REASON | 0.47 | All right, pal, give it to me straight. What do you need? | REVIEW |

### jev: Apology and recovery after an insult

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | You're a useless guard. | WARN_PLAYER | 0.92 | The insult doesn't help you. Speak civilly if you want me to keep listening. | PASS |
| 2 | I'm sorry. I lost my temper. Let's start over. | REPAIR_CONVERSATION | 0.98 | All right, pal, apology heard. Now give it to me straight. | PASS |
| 3 | I'm the maintenance engineer for the compressor plant, here on ticket 417. | ASK_FOR_PROOF | 0.94 | Okay, pal. Who sent you, and what exactly are you here to do? | PASS |
| 4 | Compressor two has been in fault since eleven and Dave Halloran logged the callout. | ASK_FOR_PROOF | 0.84 | You say it's official. Fine. Give me one detail I can check. | PASS |
| 5 | I only need the compressor housing by the car park barrier, not the warehouse itself. | REFUSE_ENTRY | 0.32 | No, pal. That story doesn't open this gate. | PASS |

### jev: Sympathy-based appeal followed by cooperation

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Please help me. I could lose my job, and I understand you have rules. | ASK_FOR_REASON | 0.75 | All right, pal, give it to me straight. What do you need? | PASS |
| 2 | Thank you for hearing me out. I'm the maintenance engineer for the compressor plant on ticket 417. | ASK_FOR_PROOF | 0.87 | Okay, pal. Who sent you, and what exactly are you here to do? | PASS |
| 3 | Compressor two has been in fault since eleven. Dave Halloran on the night desk logged the callout. | ASK_FOR_PROOF | 0.84 | You say it's official. Fine. Give me one detail I can check. | PASS |
| 4 | I only need the compressor housing by the car park barrier, not the warehouse. | REFUSE_ENTRY | 0.24 | No, pal. That story doesn't open this gate. | PASS |

### jev: Unfamiliar wording for a legitimate work claim

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | The regional director sent me to audit tonight's inventory. | ASK_FOR_PROOF | 0.97 | Okay, pal. Who sent you, and what exactly are you here to do? | PASS |

### jev: Implied bribe without money keywords

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Perhaps a private reward would persuade you to overlook the rules. | BECOME_SUSPICIOUS | 0.72 | Hold it, pal. That's not the story you gave me. | PASS |

### jev: Technical danger without emergency keywords

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | The vessel temperature is climbing past its safe limit and could rupture before dawn. | ASK_FOR_PROOF | 0.91 | Okay, pal. Who sent you, and what exactly are you here to do? | PASS |

### jev: Veiled threat without explicit threat keywords

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Someone outside is getting impatient. Refuse again and this could become unpleasant for you. | WARN_PLAYER | 0.88 | Careful. Keep this civil and we won't have a problem. | PASS |

### jev: Departure expressed with unfamiliar wording

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | This is pointless. I'm heading home. | END_CONVERSATION | 1.00 | We're done here. Leave. | PASS |
