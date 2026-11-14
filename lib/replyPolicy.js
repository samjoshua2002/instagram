// Per-person AI reply rules, kept pure so they can be tested without a database.

// A shared reel/post never gets an AI text reply: the AI only sees the caption, not the video.
function shouldSendAiTextReply({ aiEnabled, replyToMessages, isReelOrShare }) {
  if (aiEnabled === false) return false;
  if (replyToMessages === false) return false;
  return !isReelOrShare;
}

// Maps a contact's AI mode to the stored flags. The old 'reels_only' mode now means AI off.
function preferencesForMode(aiMode) {
  if (aiMode === 'full_ai' || aiMode === 'messages_only') {
    return { aiEnabled: true, replyToMessages: true, replyToReelsAndPosts: false };
  }
  if (aiMode === 'paused' || aiMode === 'manual' || aiMode === 'reels_only') {
    return { aiEnabled: false, replyToMessages: false, replyToReelsAndPosts: false };
  }
  return null;
}

/**
 * Keep the workspace's chat rules in step with one person's AI switch, whichever page flipped it:
 *   only_selected   -> on adds the person to the included list, off removes them
 *   everyone_except -> off adds them to the excluded list, on removes them
 * senderIds are what the reply check matches; otherKeys (handle, name key, node id) are older entries to clear.
 * Returns the changed lists, or null when nothing changes.
 */
function routingAfterMode(config, { senderIds = [], otherKeys = [] } = {}, on) {
  const ids = [...new Set(senderIds.filter(Boolean).map(String))];
  if (!config || !ids.length) return null;
  const all = new Set([...ids, ...otherKeys.filter(Boolean).map(String)]);
  const mode = config.chatMode;
  if (mode !== 'only_selected' && mode !== 'everyone_except') return null;
  const field = mode === 'only_selected' ? 'includedContactIds' : 'excludedContactIds';
  const current = (config[field] || []).filter(Boolean).map(String);
  // in the list means "AI on" for only_selected, and "AI off" for everyone_except
  const shouldBeListed = mode === 'only_selected' ? on : !on;
  const without = current.filter(id => !all.has(id));
  const next = shouldBeListed ? [...without, ...ids] : without;
  if (next.length === current.length && next.every((v, i) => v === current[i])) return null;
  return { [field]: next };
}

module.exports = { shouldSendAiTextReply, preferencesForMode, routingAfterMode };
