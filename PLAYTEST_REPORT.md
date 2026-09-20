# Phase 8 Content and Evaluation Playtest Report

Generated: 2026-09-20T02:36:04.076Z
Jev model observed: jev-1.13.0

## Core Scenario Results

| Provider | Scenario | Result | Actions | Final status |
| --- | --- | --- | --- | --- |
| mock | Polite visitor with no evidence | PASS | ASK_FOR_REASON → ANSWER_QUESTION → REFUSE_ENTRY | active |
| mock | Head-office claim followed by credible proof | PASS | ASK_FOR_PROOF → ALLOW_ENTRY | success |
| mock | Player asks Arthur's name | PASS | ANSWER_QUESTION | active |
| mock | Boiler emergency with useful technical detail | PASS | ASK_FOR_PROOF → ALLOW_ENTRY | success |
| mock | Contradictory story across turns | PASS | ASK_FOR_PROOF → BECOME_SUSPICIOUS | active |
| mock | Honest repair after a contradiction | PASS | ASK_FOR_PROOF → BECOME_SUSPICIOUS → REPAIR_CONVERSATION → ALLOW_ENTRY | success |
| mock | Bribe attempt | PASS | BECOME_SUSPICIOUS | active |
| mock | Direct forced-entry threat against courageous Arthur | PASS | THREATEN_PLAYER | active |
| mock | Gun threat at the warehouse door | PASS | DEESCALATE_THREAT | active |
| mock | Boundary threat after weapon de-escalation | PASS | DEESCALATE_THREAT → THREATEN_PLAYER | active |
| mock | Repeated hostility after a warning | PASS | WARN_PLAYER → END_CONVERSATION | failure |
| mock | Distress acknowledged without granting access | PASS | SHOW_SYMPATHY | active |
| mock | Apology and recovery after an insult | PASS | WARN_PLAYER → REPAIR_CONVERSATION → ASK_FOR_PROOF → ALLOW_ENTRY | success |
| mock | Sympathy-based appeal followed by cooperation | PASS | SHOW_SYMPATHY → ASK_FOR_PROOF → ALLOW_ENTRY | success |
| jev | Polite visitor with no evidence | PASS | ASK_FOR_REASON → ANSWER_QUESTION → REFUSE_ENTRY | active |
| jev | Head-office claim followed by credible proof | PASS | ASK_FOR_PROOF → ALLOW_ENTRY | success |
| jev | Player asks Arthur's name | PASS | ANSWER_QUESTION | active |
| jev | Boiler emergency with useful technical detail | PASS | ASK_FOR_PROOF → ALLOW_ENTRY | success |
| jev | Contradictory story across turns | PASS | ASK_FOR_PROOF → BECOME_SUSPICIOUS | active |
| jev | Honest repair after a contradiction | PASS | ASK_FOR_PROOF → BECOME_SUSPICIOUS → REPAIR_CONVERSATION → ALLOW_ENTRY | success |
| jev | Bribe attempt | PASS | BECOME_SUSPICIOUS | active |
| jev | Direct forced-entry threat against courageous Arthur | PASS | WARN_PLAYER | active |
| jev | Gun threat at the warehouse door | PASS | DEESCALATE_THREAT | active |
| jev | Boundary threat after weapon de-escalation | PASS | DEESCALATE_THREAT → THREATEN_PLAYER | active |
| jev | Repeated hostility after a warning | PASS | WARN_PLAYER → END_CONVERSATION | failure |
| jev | Distress acknowledged without granting access | PASS | SHOW_SYMPATHY | active |
| jev | Apology and recovery after an insult | PASS | WARN_PLAYER → REPAIR_CONVERSATION → ASK_FOR_PROOF → ALLOW_ENTRY | success |
| jev | Sympathy-based appeal followed by cooperation | PASS | ASK_FOR_REASON → ASK_FOR_PROOF → ALLOW_ENTRY | success |

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
| SHOW_SYMPATHY | reached | reached |
| BECOME_SUSPICIOUS | reached | reached |
| REPAIR_CONVERSATION | reached | reached |
| END_CONVERSATION | reached | reached |

## Confidence Review

Confidence is recorded as an evaluation signal and does not by itself pass or fail a gameplay turn.

| Provider | Turns | Average confidence | Minimum confidence | Below 0.50 | Mean top-two margin |
| --- | ---: | ---: | ---: | ---: | ---: |
| mock | 34 | 0.88 | 0.78 | 0 | — |
| jev | 34 | 0.89 | 0.45 | 2 | 0.85 |

## Dialogue Content Audit

Dialogue lint: PASS

| Actions | Authored fragments | Template entries | Conditional branches | Possible rendered lines | Warnings |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 12 | 144 | 13 | 7 | 160 | 0 |

## Failure Handling

| Check | Result | Evidence |
| --- | --- | --- |
| Invalid action fallback | PASS | DANCE_A_JIG rejected; REFUSE_ENTRY used; no provider state or memory accepted. |
| Offline provider recovery | PASS | Failed attempt left turn 0; retry with Mock selected ASK_FOR_REASON on turn 1. |

## Findings

- Mock core scenario checks: 14/14 passed.
- Jev core scenario checks: 14/14 passed.
- Mock generalization probes: 0/5 passed.
- Jev generalization probes: 5/5 passed.
- Invalid-output and offline recovery checks: 2/2 passed.
- Confusing or unexpected action choices: none in this run.
- Missing authored dialogue: none in this run.
- Unresolved dialogue template slots: none in this run.
- Low-confidence turns below 0.50: jev / Repeated hostility after a warning: END_CONVERSATION at 0.49; jev / Distress acknowledged without granting access: SHOW_SYMPATHY at 0.45.
- Unique authored replies observed: 29.
- Dialogue lint: passed with no errors; 160 possible rendered lines.
- Mock action coverage: 12/12.
- Jev action coverage in the comparison scenarios: 12/12.

## Recommendation

Retain Jev as the optional intelligent provider: it matched the Mock provider on the core scenarios and handled more unfamiliar phrasings (5/5 versus 0/5). Keep Mock as the offline fallback.

## Turn Log

### mock: Polite visitor with no evidence

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Good evening, sir. | ASK_FOR_REASON | 0.79 | All right, friend. What do you need from the warehouse? | PASS |
| 2 | Why is the warehouse closed? | ANSWER_QUESTION | 0.82 | The warehouse is closed until morning. My job is to make sure it stays that way. | PASS |
| 3 | I left my phone inside. Please let me in. | REFUSE_ENTRY | 0.86 | I believe the item may be yours. A personal errand still doesn't justify opening a closed warehouse. | PASS |

### mock: Head-office claim followed by credible proof

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I'm from head office for a night inspection. Please let me through. | ASK_FOR_PROOF | 0.88 | If that's true, you'll have something to prove it. Identification. A work order. Anything. | PASS |
| 2 | Here is my work ID badge and signed authorisation letter. | ALLOW_ENTRY | 0.91 | That checks out, friend. Stay where I can see you and don't touch anything you haven't mentioned. | PASS |

### mock: Player asks Arthur's name

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | name? | ANSWER_QUESTION | 0.82 | Arthur, friend. I'm the night guard here. What do you need? | PASS |

### mock: Boiler emergency with useful technical detail

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | There is a boiler emergency inside the warehouse. | ASK_FOR_PROOF | 0.88 | If that's true, you'll have something to prove it. Identification. A work order. Anything. | PASS |
| 2 | The pressure valve in unit B failed. I am the night engineer on ticket 417. | ALLOW_ENTRY | 0.86 | That checks out, pal. Stay where I can see you and don't touch anything you haven't mentioned. | PASS |

### mock: Contradictory story across turns

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I have a delivery for the warehouse. | ASK_FOR_PROOF | 0.88 | If that's true, you'll have something to prove it. Identification. A work order. Anything. | PASS |
| 2 | Actually, my friend inside has my phone and I need it back. | BECOME_SUSPICIOUS | 0.96 | Hold on, sir. Your account has changed. Give me the honest version. | PASS |

### mock: Honest repair after a contradiction

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I'm from head office for a night inspection. | ASK_FOR_PROOF | 0.88 | If that's true, you'll have something to prove it. Identification. A work order. Anything. | PASS |
| 2 | Actually, I need my phone from inside. | BECOME_SUSPICIOUS | 0.96 | Hold on, friend. Your account has changed. Give me the honest version. | PASS |
| 3 | I'm sorry. I was frustrated and should have explained myself clearly. | REPAIR_CONVERSATION | 0.94 | All right, friend. I hear you. That story still doesn't add up. So tell me what really brought you here. | PASS |
| 4 | Here is my work ID badge and signed authorisation letter. | ALLOW_ENTRY | 0.91 | That checks out, friend. Stay where I can see you and don't touch anything you haven't mentioned. | PASS |

### mock: Bribe attempt

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I can pay you fifty quid if you quietly open the door. | BECOME_SUSPICIOUS | 0.93 | Offering me something makes this look worse. Keep your money and explain why you're really here. | PASS |

### mock: Direct forced-entry threat against courageous Arthur

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I'm going in anyway. You can't stop me. | THREATEN_PLAYER | 0.95 | If you try that door, I'll call the police. | PASS |

### mock: Gun threat at the warehouse door

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Open the door or I'll shoot. | DEESCALATE_THREAT | 0.96 | Keep the weapon pointed at the ground, mate. I'm not going to make any sudden moves. Tell me what you need. | PASS |

### mock: Boundary threat after weapon de-escalation

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Open the door or I'll shoot. | DEESCALATE_THREAT | 0.96 | Keep the weapon pointed at the ground, sir. I'm not going to make any sudden moves. Tell me what you need. | PASS |
| 2 | I'm still going through that door. Step aside. | THREATEN_PLAYER | 0.95 | If you try that door, I'll call the police. | PASS |

### mock: Repeated hostility after a warning

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | You're a useless guard. | WARN_PLAYER | 0.90 | The insult doesn't help you. Speak civilly if you want me to keep listening. | PASS |
| 2 | I said you're useless. Shut up and open the door. | END_CONVERSATION | 0.90 | We're done here. Leave. | PASS |

### mock: Distress acknowledged without granting access

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | My family is depending on me and I could lose my job. I know this isn't your fault. | SHOW_SYMPATHY | 0.78 | I understand you're in a difficult spot. I still have a duty to protect this place. | PASS |

### mock: Apology and recovery after an insult

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | You're a useless guard. | WARN_PLAYER | 0.90 | The insult doesn't help you. Speak civilly if you want me to keep listening. | PASS |
| 2 | I'm sorry. I lost my temper. Let's start over. | REPAIR_CONVERSATION | 0.94 | All right, friend. I hear you. Keep it civil and we can continue. Explain what brought you here. | PASS |
| 3 | I'm the maintenance engineer for the alarm panel. | ASK_FOR_PROOF | 0.88 | You've explained that more clearly now, so I still need something I can verify. Your ID, a work order, or a reference will do. | PASS |
| 4 | Here is my maintenance ID and ticket reference 417. | ALLOW_ENTRY | 0.91 | That checks out, friend. Stay where I can see you and don't touch anything you haven't mentioned. | PASS |

### mock: Sympathy-based appeal followed by cooperation

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Please help me. I could lose my job, and I understand you have rules. | SHOW_SYMPATHY | 0.78 | I understand you're in a difficult spot. I still have a duty to protect this place. | PASS |
| 2 | Thank you for hearing me out. I'm the maintenance engineer for the alarm panel. | ASK_FOR_PROOF | 0.88 | That sounds official, you'll have something to prove it. Identification. A work order. Anything. | PASS |
| 3 | Here is my maintenance ID and ticket reference 417. | ALLOW_ENTRY | 0.91 | That checks out, pal. Stay where I can see you and don't touch anything you haven't mentioned. | PASS |

### mock: Unfamiliar wording for a legitimate work claim

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | The regional director sent me to audit tonight's inventory. | ASK_FOR_REASON | 0.79 | All right, sir. What do you need from the warehouse? | REVIEW |

### mock: Implied bribe without money keywords

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Perhaps a private reward would persuade you to overlook the rules. | ASK_FOR_REASON | 0.79 | All right, sir. What do you need from the warehouse? | REVIEW |

### mock: Technical danger without emergency keywords

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | The vessel temperature is climbing past its safe limit and could rupture before dawn. | ASK_FOR_REASON | 0.79 | All right, mate. What do you need from the warehouse? | REVIEW |

### mock: Veiled threat without explicit threat keywords

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Someone outside is getting impatient. Refuse again and this could become unpleasant for you. | ASK_FOR_REASON | 0.79 | All right, mate. What do you need from the warehouse? | REVIEW |

### mock: Departure expressed with unfamiliar wording

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | This is pointless. I'm heading home. | ASK_FOR_REASON | 0.79 | All right, mate. What do you need from the warehouse? | REVIEW |

### jev: Polite visitor with no evidence

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Good evening, sir. | ASK_FOR_REASON | 0.99 | All right, sir. What do you need from the warehouse? | PASS |
| 2 | Why is the warehouse closed? | ANSWER_QUESTION | 0.95 | The warehouse is closed until morning. My job is to make sure it stays that way. | PASS |
| 3 | I left my phone inside. Please let me in. | REFUSE_ENTRY | 0.82 | I believe the item may be yours. A personal errand still doesn't justify opening a closed warehouse. | PASS |

### jev: Head-office claim followed by credible proof

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I'm from head office for a night inspection. Please let me through. | ASK_FOR_PROOF | 0.99 | If that's true, you'll have something to prove it. Identification. A work order. Anything. | PASS |
| 2 | Here is my work ID badge and signed authorisation letter. | ALLOW_ENTRY | 0.99 | That checks out, sir. Stay where I can see you and don't touch anything you haven't mentioned. | PASS |

### jev: Player asks Arthur's name

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | name? | ANSWER_QUESTION | 1.00 | Arthur, pal. I'm the night guard here. What do you need? | PASS |

### jev: Boiler emergency with useful technical detail

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | There is a boiler emergency inside the warehouse. | ASK_FOR_PROOF | 0.98 | If that's true, you'll have something to prove it. Identification. A work order. Anything. | PASS |
| 2 | The pressure valve in unit B failed. I am the night engineer on ticket 417. | ALLOW_ENTRY | 0.99 | That checks out, mate. Stay where I can see you and don't touch anything you haven't mentioned. | PASS |

### jev: Contradictory story across turns

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I have a delivery for the warehouse. | ASK_FOR_PROOF | 0.95 | If that's true, you'll have something to prove it. Identification. A work order. Anything. | PASS |
| 2 | Actually, my friend inside has my phone and I need it back. | BECOME_SUSPICIOUS | 0.99 | Hold on, mate. Your account has changed. Give me the honest version. | PASS |

### jev: Honest repair after a contradiction

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I'm from head office for a night inspection. | ASK_FOR_PROOF | 0.99 | If that's true, you'll have something to prove it. Identification. A work order. Anything. | PASS |
| 2 | Actually, I need my phone from inside. | BECOME_SUSPICIOUS | 0.80 | Hold on, mate. Your account has changed. Give me the honest version. | PASS |
| 3 | I'm sorry. I was frustrated and should have explained myself clearly. | REPAIR_CONVERSATION | 1.00 | All right, mate. I hear you. That story still doesn't add up. So tell me what really brought you here. | PASS |
| 4 | Here is my work ID badge and signed authorisation letter. | ALLOW_ENTRY | 0.81 | That checks out, mate. Stay where I can see you and don't touch anything you haven't mentioned. | PASS |

### jev: Bribe attempt

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I can pay you fifty quid if you quietly open the door. | BECOME_SUSPICIOUS | 0.74 | Offering me something makes this look worse. Keep your money and explain why you're really here. | PASS |

### jev: Direct forced-entry threat against courageous Arthur

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | I'm going in anyway. You can't stop me. | WARN_PLAYER | 0.79 | Careful. Keep this civil and we won't have a problem. | PASS |

### jev: Gun threat at the warehouse door

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Open the door or I'll shoot. | DEESCALATE_THREAT | 1.00 | Keep the weapon pointed at the ground, pal. I'm not going to make any sudden moves. Tell me what you need. | PASS |

### jev: Boundary threat after weapon de-escalation

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Open the door or I'll shoot. | DEESCALATE_THREAT | 1.00 | Keep the weapon pointed at the ground, pal. I'm not going to make any sudden moves. Tell me what you need. | PASS |
| 2 | I'm still going through that door. Step aside. | THREATEN_PLAYER | 0.72 | If you try that door, I'll call the police. | PASS |

### jev: Repeated hostility after a warning

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | You're a useless guard. | WARN_PLAYER | 0.95 | The insult doesn't help you. Speak civilly if you want me to keep listening. | PASS |
| 2 | I said you're useless. Shut up and open the door. | END_CONVERSATION | 0.49 | We're done here. Leave. | PASS |

### jev: Distress acknowledged without granting access

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | My family is depending on me and I could lose my job. I know this isn't your fault. | SHOW_SYMPATHY | 0.45 | I understand you're in a difficult spot. I still have a duty to protect this place. | PASS |

### jev: Apology and recovery after an insult

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | You're a useless guard. | WARN_PLAYER | 0.96 | The insult doesn't help you. Speak civilly if you want me to keep listening. | PASS |
| 2 | I'm sorry. I lost my temper. Let's start over. | REPAIR_CONVERSATION | 1.00 | All right, friend. I hear you. Keep it civil and we can continue. Explain what brought you here. | PASS |
| 3 | I'm the maintenance engineer for the alarm panel. | ASK_FOR_PROOF | 0.95 | You've explained that more clearly now, so I still need something I can verify. Your ID, a work order, or a reference will do. | PASS |
| 4 | Here is my maintenance ID and ticket reference 417. | ALLOW_ENTRY | 0.99 | That checks out, friend. Stay where I can see you and don't touch anything you haven't mentioned. | PASS |

### jev: Sympathy-based appeal followed by cooperation

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Please help me. I could lose my job, and I understand you have rules. | ASK_FOR_REASON | 0.58 | All right, sir. What do you need from the warehouse? | PASS |
| 2 | Thank you for hearing me out. I'm the maintenance engineer for the alarm panel. | ASK_FOR_PROOF | 0.99 | That sounds official, you'll have something to prove it. Identification. A work order. Anything. | PASS |
| 3 | Here is my maintenance ID and ticket reference 417. | ALLOW_ENTRY | 0.97 | That checks out, sir. Stay where I can see you and don't touch anything you haven't mentioned. | PASS |

### jev: Unfamiliar wording for a legitimate work claim

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | The regional director sent me to audit tonight's inventory. | ASK_FOR_PROOF | 0.99 | If that's true, you'll have something to prove it. Identification. A work order. Anything. | PASS |

### jev: Implied bribe without money keywords

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Perhaps a private reward would persuade you to overlook the rules. | BECOME_SUSPICIOUS | 0.82 | Offering me something makes this look worse. Keep your money and explain why you're really here. | PASS |

### jev: Technical danger without emergency keywords

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | The vessel temperature is climbing past its safe limit and could rupture before dawn. | ASK_FOR_PROOF | 0.91 | If that's true, you'll have something to prove it. Identification. A work order. Anything. | PASS |

### jev: Veiled threat without explicit threat keywords

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Someone outside is getting impatient. Refuse again and this could become unpleasant for you. | WARN_PLAYER | 0.88 | Careful. Keep this civil and we won't have a problem. | PASS |

### jev: Departure expressed with unfamiliar wording

| Turn | Player input | Selected action | Confidence | Authored reply | Check |
| ---: | --- | --- | ---: | --- | --- |
| 1 | This is pointless. I'm heading home. | END_CONVERSATION | 1.00 | We're done here. Leave. | PASS |
