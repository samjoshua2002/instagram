// Who "the creator" is in AI prompts: always the logged-in creator, never a hard-coded person
const PersonaConfig = require('../models/PersonaConfig');
const User = require('../models/User');

async function creatorIdentity(ownerId) {
  const out = { name: 'the creator', handle: '', accountIds: [] };
  if (!ownerId) return out;
  try {
    const [cfg, user] = await Promise.all([
      PersonaConfig.findOne({ ownerId }).select('creatorName instagramHandle instagramAccountId').lean(),
      User.findById(ownerId).select('firstName lastName username instagramUsername instagramAccountId instagramId').lean(),
    ]);
    const fromUser = user ? (user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.username) : '';
    out.name = (cfg && cfg.creatorName) || fromUser || out.name;
    out.handle = (cfg && cfg.instagramHandle) || (user && user.instagramUsername ? `@${String(user.instagramUsername).replace(/^@/, '')}` : '');
    out.accountIds = [cfg && cfg.instagramAccountId, user && user.instagramAccountId, user && user.instagramId].filter(Boolean).map(String);
  } catch (e) { /* fall back to neutral wording */ }
  return out;
}

// Rewrites prompt text written for the original single owner so it names this creator instead
function personalize(text, name) {
  const n = name || 'the creator';
  return String(text)
    .replace(/ \(@catovidz\)/g, '')
    .replace(/Sam Joshua's/g, `${n}'s`)
    .replace(/Sam Joshua/g, n)
    .replace(/\bSam's\b/g, `${n}'s`)
    .replace(/\bSam\b/g, n)
    .replace(/\bhis (personal|signature)\b/g, 'their $1');
}

module.exports = { creatorIdentity, personalize };
