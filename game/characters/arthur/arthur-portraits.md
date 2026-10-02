---
type: portraits
character: "[[Arthur]]"
---

# Arthur — portraits

The intercom shows Arthur from the `portrait` slot. He speaks in the mood of each line (its talking loop, longer for longer lines), then settles back to his neutral idle frame and blinks now and then.

The frames come from the `booth` composite on [[Assets.canvas]]: Arthur's stills and talking loops on a green screen, keyed together and pasted into his guard booth. Remake them there, and the game uses the new ones.

## Idle
```yaml
frame: "[[booth-guard-actor.webp]]"
```

## Talking
```yaml
frameMs: 125
msPerCharacter: 55
minMs: 1200
frames:
  - "[[booth-guard-talk-01.webp]]"
  - "[[booth-guard-talk-02.webp]]"
  - "[[booth-guard-talk-03.webp]]"
  - "[[booth-guard-talk-04.webp]]"
  - "[[booth-guard-talk-05.webp]]"
  - "[[booth-guard-talk-06.webp]]"
  - "[[booth-guard-talk-07.webp]]"
  - "[[booth-guard-talk-08.webp]]"
  - "[[booth-guard-talk-07.webp]]"
  - "[[booth-guard-talk-06.webp]]"
  - "[[booth-guard-talk-05.webp]]"
  - "[[booth-guard-talk-04.webp]]"
  - "[[booth-guard-talk-03.webp]]"
  - "[[booth-guard-talk-02.webp]]"
```

## Talking by mood
While he speaks a line with one of these cues, he uses that mood's loop instead.

```yaml
friendly:
  - "[[booth-arthur-friendly-talk-01.webp]]"
  - "[[booth-arthur-friendly-talk-02.webp]]"
  - "[[booth-arthur-friendly-talk-03.webp]]"
  - "[[booth-arthur-friendly-talk-04.webp]]"
  - "[[booth-arthur-friendly-talk-05.webp]]"
  - "[[booth-arthur-friendly-talk-06.webp]]"
  - "[[booth-arthur-friendly-talk-07.webp]]"
  - "[[booth-arthur-friendly-talk-08.webp]]"
  - "[[booth-arthur-friendly-talk-07.webp]]"
  - "[[booth-arthur-friendly-talk-06.webp]]"
  - "[[booth-arthur-friendly-talk-05.webp]]"
  - "[[booth-arthur-friendly-talk-04.webp]]"
  - "[[booth-arthur-friendly-talk-03.webp]]"
  - "[[booth-arthur-friendly-talk-02.webp]]"
irritated:
  - "[[booth-arthur-irritated-talk-01.webp]]"
  - "[[booth-arthur-irritated-talk-02.webp]]"
  - "[[booth-arthur-irritated-talk-03.webp]]"
  - "[[booth-arthur-irritated-talk-04.webp]]"
  - "[[booth-arthur-irritated-talk-05.webp]]"
  - "[[booth-arthur-irritated-talk-06.webp]]"
  - "[[booth-arthur-irritated-talk-07.webp]]"
  - "[[booth-arthur-irritated-talk-08.webp]]"
  - "[[booth-arthur-irritated-talk-07.webp]]"
  - "[[booth-arthur-irritated-talk-06.webp]]"
  - "[[booth-arthur-irritated-talk-05.webp]]"
  - "[[booth-arthur-irritated-talk-04.webp]]"
  - "[[booth-arthur-irritated-talk-03.webp]]"
  - "[[booth-arthur-irritated-talk-02.webp]]"
hostile:
  - "[[booth-arthur-hostile-talk-01.webp]]"
  - "[[booth-arthur-hostile-talk-02.webp]]"
  - "[[booth-arthur-hostile-talk-03.webp]]"
  - "[[booth-arthur-hostile-talk-04.webp]]"
  - "[[booth-arthur-hostile-talk-05.webp]]"
  - "[[booth-arthur-hostile-talk-06.webp]]"
  - "[[booth-arthur-hostile-talk-07.webp]]"
  - "[[booth-arthur-hostile-talk-08.webp]]"
  - "[[booth-arthur-hostile-talk-07.webp]]"
  - "[[booth-arthur-hostile-talk-06.webp]]"
  - "[[booth-arthur-hostile-talk-05.webp]]"
  - "[[booth-arthur-hostile-talk-04.webp]]"
  - "[[booth-arthur-hostile-talk-03.webp]]"
  - "[[booth-arthur-hostile-talk-02.webp]]"
suspicious:
  - "[[booth-arthur-suspicious-talk-01.webp]]"
  - "[[booth-arthur-suspicious-talk-02.webp]]"
  - "[[booth-arthur-suspicious-talk-03.webp]]"
  - "[[booth-arthur-suspicious-talk-04.webp]]"
  - "[[booth-arthur-suspicious-talk-05.webp]]"
  - "[[booth-arthur-suspicious-talk-06.webp]]"
  - "[[booth-arthur-suspicious-talk-07.webp]]"
  - "[[booth-arthur-suspicious-talk-08.webp]]"
  - "[[booth-arthur-suspicious-talk-07.webp]]"
  - "[[booth-arthur-suspicious-talk-06.webp]]"
  - "[[booth-arthur-suspicious-talk-05.webp]]"
  - "[[booth-arthur-suspicious-talk-04.webp]]"
  - "[[booth-arthur-suspicious-talk-03.webp]]"
  - "[[booth-arthur-suspicious-talk-02.webp]]"
afraid:
  - "[[booth-arthur-afraid-talk-01.webp]]"
  - "[[booth-arthur-afraid-talk-02.webp]]"
  - "[[booth-arthur-afraid-talk-03.webp]]"
  - "[[booth-arthur-afraid-talk-04.webp]]"
  - "[[booth-arthur-afraid-talk-05.webp]]"
  - "[[booth-arthur-afraid-talk-06.webp]]"
  - "[[booth-arthur-afraid-talk-07.webp]]"
  - "[[booth-arthur-afraid-talk-08.webp]]"
  - "[[booth-arthur-afraid-talk-07.webp]]"
  - "[[booth-arthur-afraid-talk-06.webp]]"
  - "[[booth-arthur-afraid-talk-05.webp]]"
  - "[[booth-arthur-afraid-talk-04.webp]]"
  - "[[booth-arthur-afraid-talk-03.webp]]"
  - "[[booth-arthur-afraid-talk-02.webp]]"
dismissive:
  - "[[booth-arthur-dismissive-talk-01.webp]]"
  - "[[booth-arthur-dismissive-talk-02.webp]]"
  - "[[booth-arthur-dismissive-talk-03.webp]]"
  - "[[booth-arthur-dismissive-talk-04.webp]]"
  - "[[booth-arthur-dismissive-talk-05.webp]]"
  - "[[booth-arthur-dismissive-talk-06.webp]]"
  - "[[booth-arthur-dismissive-talk-07.webp]]"
  - "[[booth-arthur-dismissive-talk-08.webp]]"
  - "[[booth-arthur-dismissive-talk-07.webp]]"
  - "[[booth-arthur-dismissive-talk-06.webp]]"
  - "[[booth-arthur-dismissive-talk-05.webp]]"
  - "[[booth-arthur-dismissive-talk-04.webp]]"
  - "[[booth-arthur-dismissive-talk-03.webp]]"
  - "[[booth-arthur-dismissive-talk-02.webp]]"
entry-granted:
  - "[[booth-arthur-granted-talk-01.webp]]"
  - "[[booth-arthur-granted-talk-02.webp]]"
  - "[[booth-arthur-granted-talk-03.webp]]"
  - "[[booth-arthur-granted-talk-04.webp]]"
  - "[[booth-arthur-granted-talk-05.webp]]"
  - "[[booth-arthur-granted-talk-06.webp]]"
  - "[[booth-arthur-granted-talk-07.webp]]"
  - "[[booth-arthur-granted-talk-08.webp]]"
  - "[[booth-arthur-granted-talk-07.webp]]"
  - "[[booth-arthur-granted-talk-06.webp]]"
  - "[[booth-arthur-granted-talk-05.webp]]"
  - "[[booth-arthur-granted-talk-04.webp]]"
  - "[[booth-arthur-granted-talk-03.webp]]"
  - "[[booth-arthur-granted-talk-02.webp]]"
```

## Cues
His mood picture for each game cue. He speaks in these moods (see Talking by mood); between lines he rests on Idle.

```yaml
neutral: "[[booth-guard-actor.webp]]"
listening: "[[booth-guard-actor.webp]]"
blink: "[[booth-arthur-blink-closed.webp]]"
friendly: "[[booth-arthur-friendly.webp]]"
irritated: "[[booth-arthur-irritated.webp]]"
hostile: "[[booth-arthur-hostile.webp]]"
suspicious: "[[booth-arthur-suspicious.webp]]"
afraid: "[[booth-arthur-afraid.webp]]"
dismissive: "[[booth-arthur-dismissive.webp]]"
entry-granted: "[[booth-arthur-granted.webp]]"
```

## Blink
Whenever he is not talking, he blinks now and then.

```yaml
frameMs: 70
minGapMs: 2500
maxGapMs: 6000
frames:
  - "[[booth-arthur-blink-half.webp]]"
  - "[[booth-arthur-blink-closed.webp]]"
  - "[[booth-arthur-blink-half.webp]]"
```

![[booth-guard-actor.webp|110]] ![[booth-arthur-friendly.webp|110]] ![[booth-arthur-irritated.webp|110]] ![[booth-arthur-hostile.webp|110]] ![[booth-arthur-suspicious.webp|110]] ![[booth-arthur-afraid.webp|110]] ![[booth-arthur-dismissive.webp|110]] ![[booth-arthur-granted.webp|110]] ![[booth-arthur-blink-half.webp|110]] ![[booth-arthur-blink-closed.webp|110]]
