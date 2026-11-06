/**
 * Voice test: does the AI text like the owner?
 * Replays real past chats from MongoDB. For each test point the AI gets the chat up to a message
 * the contact sent and writes a reply; that is compared with what the owner really sent back.
 * The real reply (and everything after it) is hidden from the AI.
 *
 *   node scripts/voice_eval.js [--owner samjoshua] [--contacts 4] [--per 4]
 *
 * Calls the AI once per test point (contacts x per).
 */
require('dotenv').config({ quiet: true });
const connectDB = require('../config/db');
const Message = require('../models/Message');
const UserMemory = require('../models/UserMemory');
const User = require('../models/User');
const PersonaConfig = require('../models/PersonaConfig');
const azureOpenAI = require('../services/azureOpenAI');

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const EMOJI = /\p{Extended_Pictographic}/u;
const words = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;
const isPlaceholder = t => /^\[/.test(String(t || '').trim());
const isRealOwner = m => m.role === 'assistant' && !m.sentByAI && !isPlaceholder(m.text);

function stats(list) {
  const n = list.length || 1;
  const pct = f => Math.round(100 * list.filter(f).length / n);
  return {
    avgWords: +(list.reduce((a, t) => a + words(t), 0) / n).toFixed(1),
    short: pct(t => words(t) <= 4),
    emoji: pct(t => EMOJI.test(t)),
    capStart: pct(t => /^[A-Z]/.test(t)),
  };
}

async function run() {
  await connectDB();
  const owner = await User.findOne({ username: arg('owner', 'samjoshua') });
  if (!owner) throw new Error('owner not found');
  const config = await PersonaConfig.findOne({ ownerId: owner._id });
  const nContacts = parseInt(arg('contacts', '4'), 10);
  const per = parseInt(arg('per', '4'), 10);

  // Busiest contacts by real owner replies
  const top = await Message.aggregate([
    { $match: { ownerId: owner._id, role: 'assistant', sentByAI: { $ne: true } } },
    { $group: { _id: '$recipientId', n: { $sum: 1 } } },
    { $sort: { n: -1 } }, { $limit: nContacts },
  ]);

  const real = [], ai = [];
  for (const { _id: contactId } of top) {
    const userMemory = await UserMemory.findOne({ ownerId: owner._id, senderId: contactId });
    if (!userMemory) continue;
    const chat = await Message.find({ ownerId: owner._id, $or: [{ senderId: contactId }, { recipientId: contactId }] })
      .sort({ createdAt: 1 }).lean();

    // Test points: a run of contact messages followed by a real owner reply, spread over the chat
    const points = [];
    for (let i = 1; i < chat.length; i++) {
      if (isRealOwner(chat[i]) && chat[i - 1].role === 'user' && !isPlaceholder(chat[i - 1].text)) points.push(i);
    }
    const step = Math.max(1, Math.floor(points.length / per));
    const picked = points.filter((_, k) => k % step === step - 1).slice(-per);

    console.log(`\n=== @${userMemory.username || contactId} (${chat.length} msgs) ===`);
    for (const i of picked) {
      let start = i - 1;
      while (start > 0 && chat[start - 1].role === 'user') start--;
      const incomingText = chat.slice(start, i).map(m => m.text).join('\n');
      const history = chat.slice(Math.max(0, start - 10), start).map(m => ({ role: m.role, text: m.text }));
      // Real reply = the owner's message burst right after
      let end = i;
      while (end + 1 < chat.length && isRealOwner(chat[end + 1])) end++;
      const realReply = chat.slice(i, end + 1).map(m => m.text).join(' / ');

      let reply;
      try {
        reply = await azureOpenAI.generateReply({
          userMemory, messageHistory: history, incomingText, config, tenant: owner,
          features: null, asOf: chat[i].createdAt,
        });
      } catch (err) {
        reply = `(error: ${err.message})`;
      }
      reply = String(reply).replace(/\s*\[(?:STICKER|ATTACHMENT):[^\]]*\]/gi, '').trim();
      real.push(chat[i].text);
      ai.push(reply);
      console.log(`  them: ${incomingText.replace(/\n/g, ' / ').slice(0, 90)}`);
      console.log(`  REAL: ${realReply.slice(0, 90)}`);
      console.log(`  AI  : ${reply.replace(/\n/g, ' / ').slice(0, 90)}\n`);
    }
  }

  console.log('================ SCORE ================');
  console.log('REAL owner:', stats(real));
  console.log('AI reply  :', stats(ai));
  process.exit(0);
}

run().catch(err => {
  console.error('❌ voice eval failed:', err);
  process.exit(1);
});
