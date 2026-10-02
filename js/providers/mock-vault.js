// An offline stand-in for the model, for any character: each action note may
// have a `## Mock` block, { when, priority }. Of the available actions, the
// one with the highest priority whose `when` holds is chosen; else the one
// marked `default: true`; else the first available. The engine applies the
// action's effects and memory, as it does for Jev. (Arthur keeps his own,
// richer Mock in mock.js.)

import { evaluate } from "../engine/conditions.js";

export async function chooseNpcAction(context, availableActions) {
  const rules = context.mockRules ?? {};
  const view = context.mockView ?? {};
  const matched = availableActions
    .filter((id) => rules[id] && rules[id].when !== undefined && evaluate(rules[id].when, view))
    .sort((left, right) => (Number(rules[right].priority) || 0) - (Number(rules[left].priority) || 0));
  const action = matched[0] ?? availableActions.find((id) => rules[id]?.default) ?? availableActions[0];
  return {
    action,
    confidence: matched.length ? 0.8 : 0.5,
    reason: matched.length ? `The ## Mock rule for ${action} matched.` : `No ## Mock rule matched, so ${action}.`
  };
}
