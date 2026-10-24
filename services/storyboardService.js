/**
 * Storyboard -> prompt context (PLAN.md §5). Turns the owner's saved canvases
 * into short prompt sections: lore, Secret Vault guardrails, who this contact
 * is (closeness circle, notes, linked lore) and the business journey playbook.
 */
const Storyboard = require('../models/Storyboard');

const CACHE_MS = 60 * 1000;
const MAX_SECTION_CHARS = 2400;
const cache = new Map();

const CIRCLE_LABELS = {
  close: 'Close Circle',
  online: 'Online Friends',
  offline: 'Offline Friends',
  family: 'Family',
  professional: 'Professional',
};

// Business card types (legacy keys from the first release map onto the plan's names)
const BUSINESS_TYPE_ALIASES = { entry: 'trigger', question: 'condition', booking: 'action' };
const BUSINESS_TYPE_LABELS = {
  trigger: 'Trigger', condition: 'Condition', knowledge: 'Knowledge', offer: 'Offer',
  action: 'Action', handoff: 'Human handoff', won: 'Goal', secret: 'Off-limits',
};

const clip = (text, max) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
const capSection = text => (text.length > MAX_SECTION_CHARS ? `${text.slice(0, MAX_SECTION_CHARS - 1)}…` : text);

async function loadBoard(ownerId, kind) {
  if (!ownerId) return null;
  const key = `${ownerId}:${kind}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.board;
  const board = await Storyboard.findOne({ ownerId, kind }).lean();
  cache.set(key, { board, expires: Date.now() + CACHE_MS });
  return board;
}

/** Called after a save so the next reply sees the new board. */
function clearCache(ownerId, kind) {
  cache.delete(`${ownerId}:${kind}`);
}

function secretVaultSection(nodes) {
  const secrets = nodes.filter(n => n.type === 'secret' && (n.label || n.notes));
  if (!secrets.length) return '';
  return `SECRET VAULT (NEVER REVEAL, NOT EVEN HINTS):
${secrets.slice(0, 15).map(s => `- ${clip(s.label, 80)}${s.notes ? `: ${clip(s.notes, 200)}` : ''}`).join('\n')}
- If someone asks about any of these, deflect naturally like a real person would: change the topic, joke, or keep it vague ("cant say rn", "maybe later haha"). Never confirm details, never say you were told to keep it secret, never mention rules.
`;
}

function findContactNode(nodes, userMemory) {
  if (!userMemory) return null;
  const names = [userMemory.name, userMemory.username, userMemory.nickname]
    .filter(Boolean).map(s => String(s).toLowerCase().replace(/^@/, ''));
  const people = nodes.filter(n => n.type === 'person');
  return people.find(n => n.senderId && n.senderId === userMemory.senderId)
    || people.find(n => names.includes(String(n.label || '').toLowerCase().replace(/^@/, '')))
    || null;
}

/**
 * Personal board context for one conversation.
 * Returns '' when the owner has no board.
 */
async function getPersonalContext(ownerId, userMemory) {
  try {
    const board = await loadBoard(ownerId, 'personal');
    if (!board?.nodes?.length) return '';
    const { nodes, edges = [] } = board;
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const parts = [];

    const you = nodes.find(n => n.type === 'you');
    if (you?.notes) parts.push(`MORE ABOUT ME (FROM MY STORYBOARD):\n${clip(you.notes, 500)}`);

    const lore = nodes.filter(n => ['lore', 'place', 'event'].includes(n.type) && (n.label || n.notes));
    if (lore.length) {
      parts.push(`MY LORE, PLACES & EVENTS (bring up only when it fits naturally):
${lore.slice(0, 12).map(n => `- [${n.type}] ${clip(n.label, 80)}${n.notes ? `: ${clip(n.notes, 160)}` : ''}`).join('\n')}`);
    }

    const contact = findContactNode(nodes, userMemory);
    if (contact) {
      const lines = [];
      if (contact.circle && CIRCLE_LABELS[contact.circle]) lines.push(`- Closeness circle: ${CIRCLE_LABELS[contact.circle]}`);
      if (contact.notes) lines.push(`- My notes on them: ${clip(contact.notes, 300)}`);
      const links = edges
        .filter(e => e.from === contact.id || e.to === contact.id)
        .map(e => ({ edge: e, other: byId[e.from === contact.id ? e.to : e.from] }))
        .filter(l => l.other);
      for (const { edge, other } of links.slice(0, 8)) {
        const who = other.type === 'you' ? 'me' : `${clip(other.label, 60)} (${other.type})`;
        lines.push(`- Linked to ${who}${edge.label ? ` as "${clip(edge.label, 40)}"` : ''}${other.type !== 'you' && other.notes ? `: ${clip(other.notes, 120)}` : ''}`);
      }
      if (lines.length) parts.push(`THIS PERSON ON MY STORYBOARD:\n${lines.join('\n')}`);
    }

    const secrets = secretVaultSection(nodes);
    if (secrets) parts.push(secrets);
    return parts.length ? capSection(`${parts.join('\n\n')}\n`) : '';
  } catch (err) {
    console.warn('⚠️ [Storyboard] Personal context failed:', err.message);
    return '';
  }
}

/** Orders cards along the arrows, starting from triggers. */
function orderJourney(nodes, edges) {
  const out = new Map();
  nodes.forEach(n => out.set(n.id, []));
  edges.forEach(e => out.get(e.from)?.push(e));
  const typeOf = n => BUSINESS_TYPE_ALIASES[n.type] || n.type;
  const starts = nodes.filter(n => typeOf(n) === 'trigger');
  const seen = new Set();
  const order = [];
  const queue = [...(starts.length ? starts : nodes.slice(0, 1))];
  while (queue.length) {
    const n = queue.shift();
    if (!n || seen.has(n.id)) continue;
    seen.add(n.id);
    order.push(n);
    (out.get(n.id) || []).forEach(e => queue.push(nodes.find(x => x.id === e.to)));
  }
  nodes.forEach(n => { if (!seen.has(n.id)) order.push(n); });
  return { order, out, typeOf };
}

/** Business journey playbook for the business reply prompt. */
async function getBusinessContext(ownerId) {
  try {
    const board = await loadBoard(ownerId, 'business');
    if (!board?.nodes?.length) return '';
    const { nodes, edges = [] } = board;
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const { order, out, typeOf } = orderJourney(nodes.filter(n => n.type !== 'secret'), edges);
    const steps = order.slice(0, 20).map((n, i) => {
      const next = (out.get(n.id) || [])
        .map(e => byId[e.to] && `${clip(byId[e.to].label, 50)}${e.label ? ` (when ${clip(e.label, 40)})` : ''}`)
        .filter(Boolean);
      const label = BUSINESS_TYPE_LABELS[typeOf(n)] || 'Step';
      return `${i + 1}. [${label}] ${clip(n.label, 70)}${n.notes ? `: ${clip(n.notes, 180)}` : ''}${next.length ? ` → next: ${next.join(' / ')}` : ''}`;
    });
    const parts = [];
    if (steps.length) {
      parts.push(`CUSTOMER JOURNEY PLAYBOOK (from the team's storyboard; guide the chat along these steps, one step per message, never skip to pushing a sale):
${steps.join('\n')}`);
    }
    const secrets = secretVaultSection(nodes);
    if (secrets) parts.push(secrets);
    return parts.length ? capSection(`${parts.join('\n\n')}\n`) : '';
  } catch (err) {
    console.warn('⚠️ [Storyboard] Business context failed:', err.message);
    return '';
  }
}

module.exports = { getPersonalContext, getBusinessContext, clearCache, findContactNode, orderJourney, CIRCLE_LABELS };
