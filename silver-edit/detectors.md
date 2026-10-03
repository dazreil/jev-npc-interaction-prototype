---
type: detectors
---

# Detectors

Named word patterns. Conditions test them as `detector.<name>` for the player's latest message. Each `match` / `miss` list is a test that `npm run vault:check` runs.

## question
A question.

```yaml
pattern: \?|\b(what|why|who|when|where|how|is there|are you|do you|can you tell)\b
```

## polite
Polite words.

```yaml
pattern: \b(please|thank you|thanks|appreciate|sorry|kind of you|lovely to meet)\b
```

## leave
Elena is leaving the talk.

```yaml
pattern: \b(goodbye|bye|see you|i should go|i'll let you|get back to work|later|goodnight)\b
match:
  - I'll let you get back to it
miss:
  - Tell me more
```

## work
Talk about the work.

```yaml
pattern: \b(manuscript|edit|editing|book|draft|deadline|chapter|author|publish|harrow|proofs?|catalogue|list)\b
match:
  - How is the Harrow manuscript coming?
miss:
  - Nice weather
```

## personal
A personal question about loss or family.

```yaml
pattern: \b(wife|married|family|lonely|grief|loss|lost someone|how are you holding|are you okay|you seem sad|ring)\b
match:
  - Were you married?
miss:
  - Where is the coffee?
```

## compliment
A compliment.

```yaml
pattern: \b(beautiful|lovely|nice|great|love your|handsome|cute|gorgeous|cool|charming)\b
```

## rebuff
Elena pushes back.

```yaml
pattern: \b(not interested|stop|back off|keep it professional|no thanks|leave me alone|too much)\b
match:
  - Let's keep it professional
miss:
  - That's funny
```

## arthur
Talk about Arthur.

```yaml
pattern: \b(arthur|thorne|the boss|your boss|his wife)\b
```

## vespera
Talk about Vespera Thorne and horror films.

```yaml
pattern: \b(vespera|horror|film|films|movie|director|gothic|scary)\b
match:
  - Who is Vespera Thorne?
miss:
  - Good morning
```

## sketch
Talk about Chloe's drawings.

```yaml
pattern: \b(draw|drawing|drawings|sketch|sketches|art|notebook)\b
```

## sympathy
Reassurance.

```yaml
pattern: \b(it's okay|don't worry|you're fine|that's alright|i understand|i believe you)\b
```

## magic
Talk of magic or the coven.

```yaml
pattern: \b(magic|power|coven|witch|spell|craft)\b
```

## refusal
Elena refuses Malphas.

```yaml
pattern: \b(no|never|leave me|go away|i won't|i refuse|get out|not yours|let me go|stop)\b
match:
  - No. Leave me alone.
  - I won't come back
miss:
  - I know
```

## yield
Elena gives in to Malphas.

```yaml
pattern: \b(yes|i'll come|take me|i'm tired|so tired|i give up|i want to rest|i surrender|okay|fine|please)\b
match:
  - Yes. Take me.
  - I'm so tired
miss:
  - You are not my master
```
