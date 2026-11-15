/**
 * The texting-style quiz: the AI guesses how you'd reply (without seeing your answer), you reply,
 * the two are scored, and at the end your answers are turned into persona fields you can apply.
 */
const PersonaConfig = require('../models/PersonaConfig');
const QuizSession = require('../models/QuizSession');
const { allItems, FROM_LABEL } = require('./quizBank');
const { styleScore, matchScore } = require('./quizRules');

const FAST = () => process.env.FAST_MODEL || 'gpt-5.4-mini';

// The session's own questions (real messages), or the old built-in list for older sessions
const itemsOf = session => (session.items?.length ? session.items : allItems());

function nextItem(session) {
  const done = new Set(session.answers.map(a => a.itemId));
  return itemsOf(session).find(i => !done.has(i.id)) || null;
}

/**
 * Who sends each quiz message, from your ranking: "close friend" messages come from your top
 * people (in rank order), "friend" messages from your normal people; "someone new" stays generic.
 * Returns { itemId: { senderId, name, profilePic } }.
 */
async function castFor(ownerId) {
  const SocialGraph = require('../models/SocialGraph');
  const User = require('../models/User');
  const owner = await User.findById(ownerId, { username: 1, instagramUsername: 1 }).lean();
  const me = new Set([owner?.username, owner?.instagramUsername].filter(Boolean).map(h => String(h).replace(/^@+/, '').toLowerCase()));
  const nodes = (await SocialGraph.find({ ownerId, senderId: { $nin: [null, ''] }, priority: { $in: ['top', 'normal'] } },
    { senderId: 1, name: 1, profilePic: 1, instagramHandle: 1, priority: 1, priorityRank: 1, chatsCount: 1 }).lean())
    .filter(n => !/^test_/.test(String(n.senderId)) && !me.has(String(n.instagramHandle || '').replace(/^@+/, '').toLowerCase()))
    .sort((a, b) => ((a.priorityRank ?? 1e9) - (b.priorityRank ?? 1e9)) || ((b.chatsCount || 0) - (a.chatsCount || 0)));
  const top = nodes.filter(n => n.priority === 'top');
  const normal = nodes.filter(n => n.priority === 'normal');
  const pools = { close: top.length ? top : normal, friend: normal.length ? normal : top };
  const used = { close: 0, friend: 0 };
  const cast = {};
  for (const it of allItems()) {
    const pool = pools[it.from];
    if (!pool?.length) continue;
    const n = pool[used[it.from]++ % pool.length];
    cast[it.id] = { senderId: String(n.senderId), name: n.name, profilePic: n.profilePic || '' };
  }
  return cast;
}
const ranked = async ownerId => !!(await require('../models/SocialGraph').exists({ ownerId, priority: { $in: ['top', 'normal', 'low'] } }));

async function persona(ownerId) {
  return PersonaConfig.findOne({ ownerId }).lean();
}

/** The AI's guess of your reply, from your persona, real texting and earlier quiz answers. */
async function guessReply(ownerId, item, earlier, person = null) {
  const azureOpenAI = require('./azureOpenAI');
  const voiceService = require('./voiceService');
  const { TOP_MODEL } = require('./models');
  const { toHumanText } = require('./replyStyle');
  const cfg = await persona(ownerId) || {};
  // From a real person: your real texting with them and what the AI knows about them
  const voice = await voiceService.getVoiceBlock({ ownerId, contactId: person?.senderId || 'quiz', creatorName: cfg.creatorName || 'me', incomingText: item.text }).catch(() => null);
  const pm = person ? await require('../models/PersonMemory').findOne({ ownerId, senderId: person.senderId }, { doc: 1 }).lean().catch(() => null) : null;
  const who = person ? `${person.name} (${FROM_LABEL[item.from].toLowerCase()})` : FROM_LABEL[item.from];
  const sameSender = earlier.filter(a => a.from === item.from && a.answer).slice(-6);
  const others = earlier.filter(a => a.from !== item.from && a.answer).slice(-4);
  const ex = list => list.map(a => `${FROM_LABEL[a.from]}: "${a.text}" -> you: "${a.answer}"`).join('\n');
  const text = await azureOpenAI.completeWithFallback(TOP_MODEL, [
    { role: 'system', content: `You are ${cfg.creatorName || 'the owner'}. Reply to this Instagram DM exactly the way you really would: your length, words, casing, emoji, tone. One reply, no quotes.
${cfg.aboutMe ? `ABOUT YOU: ${String(cfg.aboutMe).slice(0, 800)}\n` : ''}${cfg.characteristics ? `YOUR PERSONALITY: ${String(cfg.characteristics).slice(0, 800)}\n` : ''}${cfg.textingHabits ? `HOW YOU TEXT: ${String(cfg.textingHabits).slice(0, 600)}\n` : ''}${voice?.block ? `${voice.block}\n` : ''}${pm?.doc ? `WHAT YOU KNOW ABOUT ${String(person.name).toUpperCase()}:\n${String(pm.doc).slice(0, 1500)}\n` : ''}${sameSender.length ? `HOW YOU ANSWERED ${FROM_LABEL[item.from].toUpperCase()} BEFORE:\n${ex(sameSender)}\n` : ''}${others.length ? `OTHER ANSWERS (different people):\n${ex(others)}\n` : ''}` },
    { role: 'user', content: `${(item.before || []).map(b => `${b.who === 'you' ? 'You' : who}: ${b.text}`).join('\n')}${item.before?.length ? '\n' : ''}${who} sends: ${item.text}` },
  ], { maxTokens: 120, temperature: 0.7 });
  return toHumanText(text, { keepEmoji: true }).trim();
}

/** Same meaning? 0..100 from a small model (a different job from the one that guessed). */
async function judgeMeaning(item, real, guess) {
  try {
    const azureOpenAI = require('./azureOpenAI');
    const out = await azureOpenAI.jsonWithFallback(FAST(), [
      { role: 'system', content: 'Two replies to the same DM. Score 0-100 how much the guess says the same thing as the real reply (intent, yes/no, tone, how much is shared). Ignore spelling and style. Also one short note on the biggest difference. JSON only: {"meaning": n, "note": "..."}' },
      { role: 'user', content: `DM: ${item.text}\nREAL: ${real}\nGUESS: ${guess}` },
    ]);
    return { meaning: Math.max(0, Math.min(100, Number(out?.meaning) || 0)), note: String(out?.note || '').slice(0, 160) };
  } catch {
    return { meaning: NaN, note: '' };
  }
}

/** Your ranked people (top, normal, low) for building real-message questions. */
async function rankedPeople(ownerId) {
  const SocialGraph = require('../models/SocialGraph');
  const User = require('../models/User');
  const owner = await User.findById(ownerId, { username: 1, instagramUsername: 1 }).lean();
  const me = new Set([owner?.username, owner?.instagramUsername].filter(Boolean).map(h => String(h).replace(/^@+/, '').toLowerCase()));
  return (await SocialGraph.find({ ownerId, senderId: { $nin: [null, ''] }, priority: { $in: ['top', 'normal', 'low'] } },
    { senderId: 1, name: 1, profilePic: 1, instagramHandle: 1, priority: 1, priorityRank: 1 }).lean())
    .filter(n => !/^test_/.test(String(n.senderId)) && !me.has(String(n.instagramHandle || '').replace(/^@+/, '').toLowerCase()))
    .sort((a, b) => (a.priorityRank ?? 1e9) - (b.priorityRank ?? 1e9))
    .map(n => ({ ...n, senderId: String(n.senderId) }));
}

async function newSession(ownerId) {
  const { buildItems } = require('./quizRealItems');
  // Never ask a message again that an earlier quiz already asked
  const past = await QuizSession.find({ ownerId }, { 'answers.text': 1 }).lean();
  const used = new Set(past.flatMap(p => (p.answers || []).map(a => String(a.text || '').trim().toLowerCase())));
  const items = await buildItems(ownerId, await rankedPeople(ownerId), used).catch(err => { console.warn('⚠️ [Quiz] real items:', err.message); return []; });
  return QuizSession.create({ ownerId, items: items.length >= 12 ? items : [] });
}

async function start(ownerId) {
  let open = await QuizSession.findOne({ ownerId, status: 'active' }).sort({ createdAt: -1 });
  // An untouched quiz from the old built-in list is swapped for one from your real chats
  if (open && !open.items?.length && !open.answers.length) { open.status = 'done'; await open.save(); open = null; }
  const session = open || await newSession(ownerId);
  const cast = await castFor(ownerId).catch(() => ({}));
  return { session, next: nextItem(session), total: itemsOf(session).length, items: itemsOf(session), cast, ranked: await ranked(ownerId) };
}

async function answer(ownerId, sessionId, { itemId, text, skip = false }) {
  const session = await QuizSession.findOne({ _id: sessionId, ownerId });
  if (!session) throw new Error('Quiz not found');
  const item = itemsOf(session).find(i => i.id === itemId);
  if (!item || session.answers.some(a => a.itemId === itemId)) throw new Error('Unknown or already answered question');
  const person = item.personId ? { senderId: item.personId, name: item.personName } : ((await castFor(ownerId).catch(() => ({})))[itemId] || null);
  const who = person ? { personId: person.senderId, personName: person.name, realReply: item.realReply || '' } : {};
  if (skip) {
    session.answers.push({ itemId, from: item.from, text: item.text, skipped: true, ...who });
    await session.save();
    return { result: null, next: nextItem(session), session };
  }
  const real = String(text || '').trim().slice(0, 600);
  const aiGuess = await guessReply(ownerId, item, session.answers, person);
  const style = styleScore(real, aiGuess);
  const { meaning, note } = await judgeMeaning(item, real, aiGuess);
  const score = matchScore(style, meaning);
  session.answers.push({ itemId, from: item.from, text: item.text, ...who, answer: real, aiGuess, style, meaning: Number.isFinite(meaning) ? meaning : null, score, note });
  await session.save();
  return { result: { aiGuess, style, meaning, score, note }, next: nextItem(session), session };
}

/** Persona fields written from your answers (a draft you can review and apply). */
async function finish(ownerId, sessionId) {
  const session = await QuizSession.findOne({ _id: sessionId, ownerId });
  if (!session) throw new Error('Quiz not found');
  const answered = session.answers.filter(a => a.answer);
  if (answered.length < 12) throw new Error('Answer at least 12 to write your persona');
  const cfg = await persona(ownerId) || {};
  const azureOpenAI = require('./azureOpenAI');
  const { TOP_MODEL } = require('./models');
  const out = await azureOpenAI.jsonWithFallback(TOP_MODEL, [
    { role: 'system', content: `From the owner's real answers to realistic DMs (from strangers, friends and close friends), write their persona in their own plain words, second person avoided, short paragraphs. Base everything on the answers; keep anything in the current fields that the answers don't contradict.
Return JSON only: {"characteristics": "...", "textingHabits": "...", "replyRules": "...", "toneGuidelines": "...", "boundaries": "...", "byPerson": {"stranger": "...", "friend": "...", "close": "..."}, "people": {"<exact name>": "<how the owner texts this person, from their answers to them only>"}, "summary": "<2 lines: what was learned>"}` },
    { role: 'user', content: `CURRENT FIELDS:\ncharacteristics: ${String(cfg.characteristics || '').slice(0, 1500)}\ntextingHabits: ${String(cfg.textingHabits || '').slice(0, 1200)}\nreplyRules: ${String(cfg.replyRules || '').slice(0, 1200)}\ntoneGuidelines: ${String(cfg.toneGuidelines || '').slice(0, 1200)}\n\nANSWERS:\n${answered.map(a => `${a.personName ? `${a.personName} (${FROM_LABEL[a.from].toLowerCase()})` : FROM_LABEL[a.from]}: "${a.text}" -> "${a.answer}"`).join('\n')}` },
  ]);
  session.draft = out || null;
  session.status = 'done';
  await session.save();
  const scored = answered.filter(a => Number.isFinite(a.score));
  return { draft: session.draft, average: scored.length ? Math.round(scored.reduce((n, a) => n + a.score, 0) / scored.length) : null, session };
}

/** Writes the draft into the persona and keeps your answers as chat examples. */
async function apply(ownerId, sessionId) {
  const session = await QuizSession.findOne({ _id: sessionId, ownerId });
  if (!session?.draft) throw new Error('Finish the quiz first');
  const d = session.draft;
  const join = (...parts) => parts.filter(Boolean).join('\n\n');
  const examples = session.answers.filter(a => a.answer).slice(-30)
    .map(a => ({ userMessage: `(${a.personName || FROM_LABEL[a.from]}) ${a.text}`, myReply: a.answer }));
  await PersonaConfig.updateOne({ ownerId }, {
    $set: {
      ...(d.characteristics ? { characteristics: d.characteristics } : {}),
      ...(d.textingHabits ? { textingHabits: d.textingHabits } : {}),
      ...(d.replyRules || d.boundaries ? { replyRules: join(d.replyRules, d.boundaries && `BOUNDARIES:\n${d.boundaries}`,
        d.byPerson && `WITH DIFFERENT PEOPLE:\n${Object.entries(d.byPerson).map(([k, v]) => `- ${FROM_LABEL[k] || k}: ${v}`).join('\n')}`) } : {}),
      ...(d.toneGuidelines ? { toneGuidelines: d.toneGuidelines } : {}),
      sampleConversations: examples,
    },
  });
  // How you text each real person in the quiz goes into their own memory
  if (d.people && typeof d.people === 'object') {
    const PersonMemory = require('../models/PersonMemory');
    const ids = new Map(session.answers.filter(a => a.personId).map(a => [String(a.personName).toLowerCase(), a.personId]));
    for (const [name, how] of Object.entries(d.people).slice(0, 40)) {
      const senderId = ids.get(String(name).toLowerCase());
      if (!senderId || !how) continue;
      await PersonMemory.updateOne({ ownerId, senderId }, {
        $push: { ownerFacts: { text: `How I text ${name} (from my quiz answers): ${String(how).slice(0, 400)}`, at: new Date() } },
        $set: { rebuildDoc: true, dirty: true },
      }).catch(() => {});
    }
  }
  session.appliedAt = new Date();
  await session.save();
  try { await require('./redisService').invalidatePersonaConfig(); } catch { /* cache is optional */ }
  return { applied: true };
}

module.exports = { start, answer, finish, apply, nextItem, newSession, itemsOf };
