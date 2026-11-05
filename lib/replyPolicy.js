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

module.exports = { shouldSendAiTextReply, preferencesForMode };
