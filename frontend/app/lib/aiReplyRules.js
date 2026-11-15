// The one rule for "does the AI reply to this person?", shared by the server (reply gate, the re-check before
// sending, follow-up reminders) and every page (People, Chat Rules, Home, Analytics). Plain CommonJS with no
// imports, so Node can require it and Next.js can import it. Change it here and both sides change together.

/** Every key a contact can be listed under in the chat-rule lists: node id, Instagram sender id, handle, name key. */
function contactKeys(c) {
  if (!c) return [];
  const handle = c.handle || c.instagramHandle || c.username || '';
  return [
    c.id,
    c.senderId,
    handle ? String(handle).replace(/^@/, '').toLowerCase() : '',
    c.name ? String(c.name).toLowerCase().replace(/[^a-z0-9]/g, '_') : '',
  ].filter(Boolean).map(String);
}

function listHas(list, contact) {
  const ids = (list || []).filter(Boolean).map(String);
  return contactKeys(contact).some(k => ids.includes(k));
}

/**
 * Is the AI on for this contact? Their own switch, then the chat mode's pick / skip list.
 * includeGlobal: also the workspace-wide pause (the server always checks it; pages show the global pause separately).
 */
function aiRepliesTo(contact, config, { includeGlobal = false } = {}) {
  if (!contact || contact.aiEnabled === false || contact.replyToMessages === false) return false;
  const c = config || {};
  if (includeGlobal && (c.globalBotActive === false || c.chatMode === 'paused')) return false;
  if (c.chatMode === 'only_selected') return listHas(c.includedContactIds, contact);
  if (c.chatMode === 'everyone_except') return !listHas(c.excludedContactIds, contact);
  return true;
}

/** Why the AI is quiet for this contact, for logs (null when it replies). */
function whyQuiet(contact, config) {
  const c = config || {};
  if (c.globalBotActive === false || c.chatMode === 'paused') return 'automation is paused';
  if (!contact) return 'unknown contact';
  if (contact.aiEnabled === false || contact.replyToMessages === false) return 'AI is off for them';
  if (c.chatMode === 'only_selected' && !listHas(c.includedContactIds, contact)) return 'not in the picked list';
  if (c.chatMode === 'everyone_except' && listHas(c.excludedContactIds, contact)) return 'in the skip list';
  return null;
}

/**
 * The chat-rule lists after one person's AI switch is flipped, so the switch works whatever the chat mode:
 *   only_selected   -> on adds them to the picked list, off removes them
 *   everyone_except -> off adds them to the skip list, on removes them
 * senderIds are what get added (what the server matches first); every other key of theirs is cleared.
 * Returns the changed list ({ includedContactIds } or { excludedContactIds }), or null when nothing changes.
 */
function listsAfterSwitch(config, { senderIds = [], otherKeys = [] } = {}, on) {
  const ids = [...new Set(senderIds.filter(Boolean).map(String))];
  if (!config || !ids.length) return null;
  const all = new Set([...ids, ...otherKeys.filter(Boolean).map(String)]);
  const mode = config.chatMode;
  if (mode !== 'only_selected' && mode !== 'everyone_except') return null;
  const field = mode === 'only_selected' ? 'includedContactIds' : 'excludedContactIds';
  const current = (config[field] || []).filter(Boolean).map(String);
  const shouldBeListed = mode === 'only_selected' ? on : !on;
  const without = current.filter(id => !all.has(id));
  const next = shouldBeListed ? [...without, ...ids] : without;
  if (next.length === current.length && next.every((v, i) => v === current[i])) return null;
  return { [field]: next };
}

module.exports = { contactKeys, listHas, aiRepliesTo, whyQuiet, listsAfterSwitch };
