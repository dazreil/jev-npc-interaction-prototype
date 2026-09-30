---
type: dialogue
action: "[[DEESCALATE_THREAT]]"
portraitCue: afraid
sound: warning
preDelayMs: 90
---

# DEESCALATE_THREAT — lines

## neutral
- I can see the weapon on the gate camera. I'm in the guard tower; pointing it at the intercom won't open the car-park gate. Put it down and tell me what you need.

## friendly
- All right. I can see you from the guard tower. The locked gate is between us, so lower the gun, take a breath, and tell me what brought you here.

## irritated
- That gun doesn't change the lock. You're outside and I'm speaking through the intercom. Put it away and tell me what you actually need.

## hostile
- You're outside a locked gate and I'm in the guard tower. The weapon won't get you into the car park. Keep it down and tell me what you want.

## weapon
%% Used when [[detectors#weapon]] matches. %%
- I can see the gun on the gate camera, [[address]]. I'm in the guard tower; pointing it at the intercom won't open the car-park gate. Put it down and tell me what you need.
- You're outside the car-park gate and I'm in the tower. The gun can't make this intercom unlock it. Lower it, take a breath, and tell me why you're here.
- That weapon doesn't change the gate. I'm in the guard tower and you're outside on camera. Put it away and tell me what you actually need.
