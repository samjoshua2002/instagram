// Pages use the same rule as the server (see aiReplyRules.js, shared with the backend).
import rules from './aiReplyRules';

export const contactKeys = rules.contactKeys;

/** Is the AI on for this contact? (per-person switch + chat mode list; the global pause is shown separately) */
export function isAiOnFor(contact, routingConfig) {
  return rules.aiRepliesTo(contact, routingConfig);
}
