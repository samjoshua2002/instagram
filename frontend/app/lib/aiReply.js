// Will the AI really reply to this contact? Same rule as Chat Rules (controls/page.jsx getContactMode)
// and the server: the chat mode's pick/skip list counts, not only the contact's own on/off flag.
const contactKeys = (c) => [
  c.id,
  c.senderId,
  c.handle ? c.handle.replace(/^@/, '').toLowerCase() : '',
  c.name ? c.name.toLowerCase().replace(/[^a-z0-9]/g, '_') : ''
].filter(Boolean);

export function isAiOnFor(contact, routingConfig) {
  if (!contact || contact.aiEnabled === false || contact.replyToMessages === false) return false;
  const config = routingConfig || {};
  const listHas = (list) => {
    const ids = (list || []).filter(Boolean);
    return contactKeys(contact).some(k => ids.includes(k));
  };
  if (config.chatMode === 'only_selected') return listHas(config.includedContactIds);
  if (config.chatMode === 'everyone_except') return !listHas(config.excludedContactIds);
  return true;
}
