export const STATE_KEYS = ["trust", "suspicion", "irritation", "fear"];

export function cloneNpc(template) {
  return structuredClone(template);
}

export function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function applyStateChanges(npc, changes = {}) {
  for (const key of STATE_KEYS) {
    const delta = Number(changes[key]);

    if (Number.isFinite(delta)) {
      npc.state[key] = clamp(npc.state[key] + clamp(delta, -25, 25));
    }
  }

  return npc.state;
}

export function determineTone(state) {
  if (state.irritation > 70) return "hostile";
  if (state.irritation > 40) return "irritated";
  if (state.trust > 65) return "friendly";
  return "neutral";
}

export function assessMessageEffort(input = "") {
  const text = String(input).trim();
  const words = text ? text.split(/\s+/) : [];

  if (words.length <= 2 || text.length <= 10) {
    return {
      label: "terse",
      description: "The player replied very briefly; Arthur may read that as impatience.",
      stateChanges: { trust: -1, irritation: 2 }
    };
  }

  if (words.length >= 12 || text.length >= 80) {
    return {
      label: "considered",
      description: "The player gave a considered explanation; Arthur has more to work with.",
      stateChanges: { trust: 1, irritation: -1 }
    };
  }

  return {
    label: "ordinary",
    description: "The player's message has an ordinary amount of detail.",
    stateChanges: {}
  };
}

export function getPrimaryGoal(npc) {
  return [...npc.goals].sort((left, right) => right.priority - left.priority)[0];
}
