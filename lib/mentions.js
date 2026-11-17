/**
 * "@handle" and "@[Name]" tags typed in answers (MentionInput on the frontend) become
 * "Name (@handle)", so the AI knows exactly which of your people you mean and can link them.
 * Only the signed-in owner's own people are looked up.
 */
const HANDLE_RE = /(^|\s)@([A-Za-z0-9._]{2,30})\b/g;
const NAME_RE = /(^|\s)@\[([^\]\n]{1,60})\]/g;

/** Pure: the handles and names tagged in a text. */
function tagsIn(text) {
  const t = String(text || '');
  return {
    handles: [...t.matchAll(HANDLE_RE)].map(m => m[2].toLowerCase()),
    names: [...t.matchAll(NAME_RE)].map(m => m[2].trim()),
  };
}

/** Pure: replaces the tags using `people` ([{ name, handle }]); unknown tags stay as typed. */
function expandWith(text, people) {
  const byHandle = new Map();
  const byName = new Map();
  for (const p of people || []) {
    const h = String(p.handle || '').replace(/^@+/, '').toLowerCase();
    if (h) byHandle.set(h, p);
    if (p.name) byName.set(String(p.name).toLowerCase(), p);
  }
  return String(text || '')
    .replace(HANDLE_RE, (m, pre, h) => {
      const p = byHandle.get(h.toLowerCase());
      return p ? `${pre}${p.name} (@${h})` : m;
    })
    .replace(NAME_RE, (m, pre, n) => {
      const p = byName.get(n.trim().toLowerCase());
      return p ? `${pre}${p.name}${p.handle ? ` (@${String(p.handle).replace(/^@+/, '')})` : ''}` : `${pre}${n.trim()}`;
    });
}

/** Looks up the tagged people among this owner's contacts and expands the text. */
async function expandMentions(ownerId, text) {
  const { handles, names } = tagsIn(text);
  if (!handles.length && !names.length) return String(text || '');
  const SocialGraph = require('../models/SocialGraph');
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const or = [
    ...handles.map(h => ({ instagramHandle: new RegExp(`^@?${esc(h)}$`, 'i') })),
    ...names.map(n => ({ name: new RegExp(`^${esc(n)}$`, 'i') })),
  ];
  const nodes = await SocialGraph.find({ ownerId: ownerId || null, $or: or }, { name: 1, instagramHandle: 1 }).limit(20).lean().catch(() => []);
  return expandWith(text, nodes.map(n => ({ name: n.name, handle: n.instagramHandle })));
}

module.exports = { tagsIn, expandWith, expandMentions };
