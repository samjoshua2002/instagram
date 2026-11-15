/**
 * The texting-style quiz: the AI guesses how you'd reply (without seeing your answer), you reply,
 * the two are scored, and at the end your answers are turned into persona fields you can apply.
 */
const PersonaConfig = require('../models/PersonaConfig');
const QuizSession = require('../models/QuizSession');
const { allItems, FROM_LABEL } = require('./quizBank');
const { styleScore, matchScore } = require('./quizRules');

const FAST = () => process.env.FAST_MODEL || 'gpt-5.4-mini';

function nextItem(session) {
  const done = new Set(session.answers.map(a => a.itemId));
  return allItems().find(i => !done.has(i.id)) || null;
}

async function persona(ownerId) {
  return PersonaConfig.findOne({ ownerId }).lean();
}

/** The AI's guess of your reply, from your persona, real texting and earlier quiz answers. */
async function guessReply(ownerId, item, earlier) {
  const azureOpenAI = require('./azureOpenAI');
  const voiceService = require('./voiceService');
  const { TOP_MODEL } = require('./models');
  const { toHumanText } = require('./replyStyle');
  const cfg = await persona(ownerId) || {};
  const voice = await voiceService.getVoiceBlock({ ownerId, contactId: 'quiz', creatorName: cfg.creatorName || 'me', incomingText: item.text }).catch(() => null);
  const sameSender = earlier.filter(a => a.from === item.from && a.answer).slice(-6);
  const others = earlier.filter(a => a.from !== item.from && a.answer).slice(-4);
  const ex = list => list.map(a => `${FROM_LABEL[a.from]}: "${a.text}" -> you: "${a.answer}"`).join('\n');
  const text = await azureOpenAI.completeWithFallback(TOP_MODEL, [
    { role: 'system', content: `You are ${cfg.creatorName || 'the owner'}. Reply to this Instagram DM exactly the way you really would: your length, words, casing, emoji, tone. One reply, no quotes.
${cfg.aboutMe ? `ABOUT YOU: ${String(cfg.aboutMe).slice(0, 800)}\n` : ''}${cfg.characteristics ? `YOUR PERSONALITY: ${String(cfg.characteristics).slice(0, 800)}\n` : ''}${cfg.textingHabits ? `HOW YOU TEXT: ${String(cfg.textingHabits).slice(0, 600)}\n` : ''}${voice?.block ? `${voice.block}\n` : ''}${sameSender.length ? `HOW YOU ANSWERED ${FROM_LABEL[item.from].toUpperCase()} BEFORE:\n${ex(sameSender)}\n` : ''}${others.length ? `OTHER ANSWERS (different people):\n${ex(others)}\n` : ''}` },
    { role: 'user', content: `${FROM_LABEL[item.from]} sends: ${item.text}` },
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

async function start(ownerId) {
  const open = await QuizSession.findOne({ ownerId, status: 'active' }).sort({ createdAt: -1 });
  const session = open || await QuizSession.create({ ownerId });
  return { session, next: nextItem(session), total: allItems().length };
}

async function answer(ownerId, sessionId, { itemId, text, skip = false }) {
  const session = await QuizSession.findOne({ _id: sessionId, ownerId });
  if (!session) throw new Error('Quiz not found');
  const item = allItems().find(i => i.id === itemId);
  if (!item || session.answers.some(a => a.itemId === itemId)) throw new Error('Unknown or already answered question');
  if (skip) {
    session.answers.push({ itemId, from: item.from, text: item.text, skipped: true });
    await session.save();
    return { result: null, next: nextItem(session), session };
  }
  const real = String(text || '').trim().slice(0, 600);
  const aiGuess = await guessReply(ownerId, item, session.answers);
  const style = styleScore(real, aiGuess);
  const { meaning, note } = await judgeMeaning(item, real, aiGuess);
  const score = matchScore(style, meaning);
  session.answers.push({ itemId, from: item.from, text: item.text, answer: real, aiGuess, style, meaning: Number.isFinite(meaning) ? meaning : null, score, note });
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
Return JSON only: {"characteristics": "...", "textingHabits": "...", "replyRules": "...", "toneGuidelines": "...", "boundaries": "...", "byPerson": {"stranger": "...", "friend": "...", "close": "..."}, "summary": "<2 lines: what was learned>"}` },
    { role: 'user', content: `CURRENT FIELDS:\ncharacteristics: ${String(cfg.characteristics || '').slice(0, 1500)}\ntextingHabits: ${String(cfg.textingHabits || '').slice(0, 1200)}\nreplyRules: ${String(cfg.replyRules || '').slice(0, 1200)}\ntoneGuidelines: ${String(cfg.toneGuidelines || '').slice(0, 1200)}\n\nANSWERS:\n${answered.map(a => `${FROM_LABEL[a.from]}: "${a.text}" -> "${a.answer}"`).join('\n')}` },
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
    .map(a => ({ userMessage: `(${FROM_LABEL[a.from]}) ${a.text}`, myReply: a.answer }));
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
  session.appliedAt = new Date();
  await session.save();
  try { await require('./redisService').invalidatePersonaConfig(); } catch { /* cache is optional */ }
  return { applied: true };
}

module.exports = { start, answer, finish, apply, nextItem };
