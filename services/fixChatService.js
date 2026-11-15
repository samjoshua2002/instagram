/**
 * "Fix with AI" on a person's page: you chat with an assistant about this person and it changes
 * their records for you: name, relationship, category, gender, age, birthday, notes, facts,
 * people in their life, AI on/off, privacy level, priority, open review questions, re-reading.
 * The model only proposes actions from the list below; each one is checked and applied here, so
 * it can never touch another account or run a raw database command.
 */
const UserMemory = require('../models/UserMemory');
const SocialGraph = require('../models/SocialGraph');
const PersonMemory = require('../models/PersonMemory');
const { TOP_MODEL } = require('./models');

const ENUMS = {
  category: ['close_friend', 'online_friend', 'offline_friend', 'family', 'professional', 'business', 'relative', 'homie', 'other'],
  gender: ['male', 'female', 'neutral', 'unknown'],
  closenessOverride: ['', 'stranger', 'acquaintance', 'friend', 'close'],
  priority: ['', 'top', 'normal', 'low'],
};
const TEXT_FIELDS = { relationshipToSam: 80, personalNotes: 2000, nickname: 60, age: 10, dob: 30 };
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function snapshot(ownerId, senderId, mq, gq) {
  const [mem, node, pm] = await Promise.all([
    UserMemory.findOne(mq).lean(),
    SocialGraph.findOne(gq).lean(),
    PersonMemory.findOne({ ownerId, senderId }, { doc: 1, doubts: 1, ownerFacts: 1, brainScore: 1, bond: 1 }).lean(),
  ]);
  return { mem, node, pm };
}

function describe({ mem, node, pm }) {
  const facts = (mem?.facts || []).map((f, i) => `  [${i}] ${f.fact}${f.source === 'you' ? ' (you said)' : ''}`).join('\n') || '  (none)';
  const people = (node?.connections || []).map(c => `  - ${c.targetName}: ${c.relationship}${c.notes ? ` (${c.notes})` : ''}`).join('\n') || '  (none)';
  const doubts = (pm?.doubts || []).filter(d => d.status === 'open').map(d => `  [${d._id}] ${d.question}`).join('\n') || '  (none)';
  const told = (pm?.ownerFacts || []).slice(-15).map(f => `  - ${f.text}`).join('\n') || '  (none)';
  return `PERSON
- name: ${node?.name || mem?.name || ''} · instagram: @${node?.instagramHandle || mem?.username || ''}
- relationshipToSam: ${node?.relationshipToSam || ''} · category: ${node?.category || ''} · gender: ${node?.gender || mem?.gender || ''}
- age: ${node?.age || mem?.age || ''} · dob: ${node?.dob || mem?.dob || ''} · nickname: ${mem?.nickname || ''}
- privacy level (closenessOverride): ${node?.closenessOverride || 'auto'} · priority: ${node?.priority || 'not set'} · AI replies: ${mem?.aiEnabled === false ? 'off' : 'on'}
- personalNotes: ${String(node?.personalNotes || mem?.personalNotes || '').slice(0, 600)}
FACTS (by index):
${facts}
PEOPLE IN THEIR LIFE:
${people}
OPEN QUESTIONS THE AI HAS (by id):
${doubts}
WHAT THE OWNER ALREADY TOLD THE AI:
${told}
MEMORY DOCUMENT (read only, rewritten from all of the above):
${String(pm?.doc || '').slice(0, 2500)}`;
}

const SYSTEM = name => `You help the owner fix what their Instagram AI clone knows about ${name}. Read the owner's message, decide what to change, and reply briefly in plain words (1-3 short sentences, friendly, no jargon) saying what you changed or asking what they mean if it's unclear. Never invent facts the owner did not say.
Available actions (use only these, as many as needed):
- {"type":"rename","name":"<new display name>"}
- {"type":"set","field":"relationshipToSam"|"category"|"gender"|"age"|"dob"|"nickname"|"personalNotes"|"closenessOverride"|"priority","value":"..."}
    category: ${ENUMS.category.join(', ')} · gender: ${ENUMS.gender.join(', ')} · closenessOverride (how much private info they may get): stranger, acquaintance, friend, close, or "" for automatic · priority: top, normal, low
- {"type":"add_fact","text":"<one fact, third person>"}
- {"type":"edit_fact","index":n,"text":"<corrected fact>"}
- {"type":"remove_fact","index":n}
- {"type":"add_person","name":"<their person>","relationship":"<e.g. mother, brother, best friend>","notes":"<optional>"}
- {"type":"remove_person","name":"<name>"}
- {"type":"answer_question","id":"<question id>","answer":"..."} / {"type":"dismiss_question","id":"<question id>"}
- {"type":"note","text":"<anything else the AI must always remember about them>"}
- {"type":"ai_replies","on":true|false}
- {"type":"reread"}   (re-read their whole chat history from scratch)
Rules: never overwrite personalNotes unless the owner asks to change the notes; new information goes in add_fact (or answer_question when it answers an open question). Wrong facts must be fixed (edit_fact) or removed, not just contradicted. A person mistakenly listed in their life (e.g. the owner's own friend) gets remove_person. If the owner just asks a question, answer it from the data and use no actions.
Return JSON only: {"reply":"...","actions":[...]}`;

async function apply({ ownerId, senderId, mq, gq, actions }) {
  const done = [];
  const memDoc = await UserMemory.findOne(mq);
  let node = await SocialGraph.findOne(gq);
  const told = [];
  let reread = false;
  const name = () => node?.name || memDoc?.name || 'them';

  for (const a of (Array.isArray(actions) ? actions : []).slice(0, 20)) {
    try {
      if (a.type === 'rename' && a.name && String(a.name).trim().length <= 60) {
        const oldName = name();
        const newName = String(a.name).trim();
        if (node) { node.name = newName; await node.save(); }
        await require('./renameService').renameEverywhere({ ownerId, senderId, oldName, newName });
        await SocialGraph.updateMany({ ownerId, 'connections.targetName': new RegExp(`^${esc(oldName)}$`, 'i') },
          { $set: { 'connections.$[e].targetName': newName } }, { arrayFilters: [{ 'e.targetName': new RegExp(`^${esc(oldName)}$`, 'i') }] });
        node = await SocialGraph.findOne(gq);
        done.push(`Renamed ${oldName} to ${newName} everywhere`);
      } else if (a.type === 'set' && (ENUMS[a.field] || TEXT_FIELDS[a.field])) {
        let v = a.value == null ? '' : String(a.value).trim();
        if (ENUMS[a.field]) { if (a.field === 'closenessOverride' && v === 'auto') v = ''; if (!ENUMS[a.field].includes(v)) continue; } else v = v.slice(0, TEXT_FIELDS[a.field]);
        if (a.field === 'nickname') { if (memDoc) { memDoc.nickname = v; await memDoc.save(); } } else if (node) {
          node[a.field] = v;
          await node.save();
          if (['gender', 'age', 'dob', 'personalNotes'].includes(a.field) && memDoc && a.field in memDoc.toObject()) { memDoc[a.field] = v; await memDoc.save().catch(() => {}); }
        }
        done.push(`${a.field === 'relationshipToSam' ? 'Relationship' : a.field === 'closenessOverride' ? 'Privacy level' : a.field} set to ${v || 'automatic'}`);
        if (['relationshipToSam', 'gender', 'age', 'dob'].includes(a.field) && v) told.push(`${name()}'s ${a.field === 'relationshipToSam' ? 'relationship to me' : a.field}: ${v}`);
      } else if (a.type === 'add_fact' && a.text && memDoc) {
        memDoc.facts.push({ fact: String(a.text).slice(0, 300), source: 'you' });
        await memDoc.save();
        told.push(String(a.text).slice(0, 300));
        done.push(`Added: ${String(a.text).slice(0, 80)}`);
      } else if (a.type === 'edit_fact' && memDoc?.facts?.[a.index] && a.text) {
        const was = memDoc.facts[a.index].fact;
        memDoc.facts[a.index].fact = String(a.text).slice(0, 300);
        memDoc.facts[a.index].source = 'you';
        await memDoc.save();
        told.push(`${String(a.text).slice(0, 300)} (not "${was.slice(0, 120)}")`);
        done.push(`Fixed: ${String(a.text).slice(0, 80)}`);
      } else if (a.type === 'remove_fact' && memDoc?.facts?.[a.index]) {
        const was = memDoc.facts[a.index].fact;
        memDoc.facts.splice(a.index, 1);
        await memDoc.save();
        told.push(`Not true: "${was.slice(0, 200)}"`);
        done.push(`Removed: ${was.slice(0, 80)}`);
      } else if (a.type === 'add_person' && a.name && node) {
        const n = String(a.name).trim().slice(0, 60);
        const existing = node.connections.find(c => c.targetName.toLowerCase() === n.toLowerCase());
        if (existing) { existing.relationship = String(a.relationship || existing.relationship).slice(0, 60); if (a.notes) existing.notes = String(a.notes).slice(0, 200); } else node.connections.push({ targetName: n, relationship: String(a.relationship || 'friend').slice(0, 60), notes: String(a.notes || '').slice(0, 200) });
        await node.save();
        told.push(`${n} is ${name()}'s ${a.relationship || 'friend'}`);
        done.push(`${n} (${a.relationship || 'friend'}) in their life`);
      } else if (a.type === 'remove_person' && a.name && node) {
        const before = node.connections.length;
        node.connections = node.connections.filter(c => c.targetName.toLowerCase() !== String(a.name).trim().toLowerCase());
        if (node.connections.length === before) continue;
        await node.save();
        told.push(`${a.name} is not someone in ${name()}'s life (remove from their memory)`);
        done.push(`Removed ${a.name} from their people`);
      } else if ((a.type === 'answer_question' || a.type === 'dismiss_question') && a.id) {
        const pm = await PersonMemory.findOne({ ownerId, senderId });
        const d = pm?.doubts?.id(a.id);
        if (!d || d.status !== 'open') continue;
        if (a.type === 'answer_question' && a.answer) { d.status = 'answered'; d.answer = String(a.answer).slice(0, 400); pm.ownerFacts.push({ text: `${d.question} -> ${d.answer}` }); done.push(`Answered: ${d.question.slice(0, 70)}`); } else { d.status = 'dismissed'; done.push(`Dismissed: ${d.question.slice(0, 70)}`); }
        Object.assign(pm, { rebuildDoc: true, dirty: true, priority: Date.now() });
        await pm.save();
      } else if (a.type === 'note' && a.text) {
        told.push(String(a.text).slice(0, 500));
        done.push('Noted for the AI');
      } else if (a.type === 'ai_replies' && typeof a.on === 'boolean') {
        if (memDoc) { memDoc.aiEnabled = a.on; await memDoc.save(); }
        if (node) { node.aiEnabled = a.on; await node.save(); }
        done.push(`AI replies ${a.on ? 'on' : 'off'} for ${name()}`);
      } else if (a.type === 'reread') {
        reread = true;
        done.push('Re-reading their whole chat');
      }
    } catch (err) {
      console.warn('⚠️ [Fix chat] action failed:', a?.type, err.message);
    }
  }

  if (told.length || reread || done.length) {
    await PersonMemory.updateOne({ ownerId, senderId }, {
      ...(told.length ? { $push: { ownerFacts: { $each: told.map(text => ({ text, at: new Date() })) } } } : {}),
      $set: { rebuildDoc: true, dirty: true, priority: Date.now(), ...(reread ? { forceRebuild: true, errorCount: 0, status: 'pending' } : {}) },
      $setOnInsert: { ownerId, senderId },
    }, { upsert: true });
  }
  return done;
}

/** One turn: messages = [{role:'user'|'assistant', content}] (the chat so far, newest last). */
async function chat({ ownerId, senderId, mq, gq, messages }) {
  const snap = await snapshot(ownerId, senderId, mq, gq);
  if (!snap.mem && !snap.node) throw Object.assign(new Error('Person not found'), { status: 404 });
  const name = snap.node?.name || snap.mem?.name || 'this person';
  const history = (Array.isArray(messages) ? messages : []).slice(-12)
    .filter(m => m && ['user', 'assistant'].includes(m.role) && m.content)
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 1500) }));
  if (!history.length || history[history.length - 1].role !== 'user') throw Object.assign(new Error('Write something'), { status: 400 });
  const azureOpenAI = require('./azureOpenAI');
  const out = await azureOpenAI.jsonWithFallback(TOP_MODEL, [
    { role: 'system', content: `${SYSTEM(name)}\n\n${describe(snap)}` },
    ...history,
  ]);
  const changes = await apply({ ownerId, senderId, mq, gq, actions: out?.actions });
  return { reply: String(out?.reply || (changes.length ? 'Done.' : 'Okay.')).slice(0, 1200), changes };
}

module.exports = { chat, apply, describe, SYSTEM };
