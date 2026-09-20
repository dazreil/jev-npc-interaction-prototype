export const ARTHUR_CHARACTER_PROFILES = Object.freeze({
  pal: Object.freeze({
    id: "pal",
    label: "Fast-talking Italian American",
    decisionStyle:
      "Quick, streetwise, impatient with evasiveness, and unwilling to be pushed around. He speaks fast and holds a firm boundary.",
    personality: Object.freeze({
      patience: 22,
      greed: 20,
      courage: 88,
      sympathy: 45,
      ruleFollowing: 76
    }),
    initialState: Object.freeze({ trust: 18, suspicion: 42, irritation: 16, fear: 4 }),
    speech: Object.freeze({ rate: 1.12, pitch: 0.74, preDelayMs: 25 })
  }),
  sir: Object.freeze({
    id: "sir",
    label: "Formal New England rule-keeper",
    decisionStyle:
      "Formal, restrained, precise, and strongly bound to procedure. He expects clear answers and documentary proof.",
    personality: Object.freeze({
      patience: 46,
      greed: 12,
      courage: 68,
      sympathy: 38,
      ruleFollowing: 96
    }),
    initialState: Object.freeze({ trust: 15, suspicion: 48, irritation: 8, fear: 5 }),
    speech: Object.freeze({ rate: 0.82, pitch: 0.7, preDelayMs: 105 })
  }),
  mate: Object.freeze({
    id: "mate",
    label: "Talkative Irish American",
    decisionStyle:
      "Warm, sociable, sympathetic, and prone to saying more than necessary. He still protects the site but gives people room to explain.",
    personality: Object.freeze({
      patience: 68,
      greed: 22,
      courage: 66,
      sympathy: 82,
      ruleFollowing: 72
    }),
    initialState: Object.freeze({ trust: 30, suspicion: 30, irritation: 5, fear: 5 }),
    speech: Object.freeze({ rate: 0.94, pitch: 0.84, preDelayMs: 45 })
  }),
  friend: Object.freeze({
    id: "friend",
    label: "Terse Eastern European",
    decisionStyle:
      "Reserved and economical with words. English is his second language, so he uses short, plain sentences and avoids idiom.",
    personality: Object.freeze({
      patience: 34,
      greed: 18,
      courage: 82,
      sympathy: 42,
      ruleFollowing: 88
    }),
    initialState: Object.freeze({ trust: 17, suspicion: 45, irritation: 9, fear: 4 }),
    speech: Object.freeze({ rate: 0.76, pitch: 0.64, preDelayMs: 85 })
  })
});

export const ARTHUR_CHARACTER_IDS = Object.freeze(Object.keys(ARTHUR_CHARACTER_PROFILES));

export function getArthurCharacterProfile(profileId) {
  return ARTHUR_CHARACTER_PROFILES[profileId] ?? ARTHUR_CHARACTER_PROFILES.pal;
}

export function applyArthurCharacterProfile(npc, profile) {
  npc.personality = { ...npc.personality, ...profile.personality };
  npc.state = { ...npc.state, ...profile.initialState };
  return npc;
}

export function getTrustEntryThreshold(personality = {}) {
  const ruleFollowing = Number(personality.ruleFollowing);
  const adjustment = Number.isFinite(ruleFollowing) ? Math.round((ruleFollowing - 80) / 4) : 0;
  return Math.min(62, Math.max(50, 55 + adjustment));
}
