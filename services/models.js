// Which Azure deployment every AI feature uses, in one place. Quality first: the top model for everything, and a
// second deployment of the same model as the fallback (so a hiccup never drops a reply to an older model).
//   TOP_MODEL       default gpt-5.6-luna      (replies, memory, people features, autofill, follow-ups)
//   FALLBACK_MODEL  default gpt-5.6-luna-2    (same model, separate deployment and quota)
const TOP_MODEL = process.env.TOP_MODEL || 'gpt-5.6-luna';
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || 'gpt-5.6-luna-2';

/** gpt-5.x / o-series think before answering: no temperature, and max_completion_tokens instead of max_tokens. */
const isReasoningModel = (model) => /^(gpt-5|o\d)/i.test(String(model || ''));

/** Token-limit and sampling params that the given model accepts. */
function completionParams(model, { maxTokens, temperature } = {}) {
  if (isReasoningModel(model)) return maxTokens ? { max_completion_tokens: Math.max(maxTokens, 1200) } : {};
  return { ...(maxTokens ? { max_tokens: maxTokens } : {}), ...(temperature !== undefined ? { temperature } : {}) };
}

module.exports = { TOP_MODEL, FALLBACK_MODEL, isReasoningModel, completionParams };
