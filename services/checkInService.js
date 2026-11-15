/**
 * Check-ins the AI starts on its own, like a caring friend would.
 * When a chat with someone you're close to has gone quiet, the AI sends one warm message in your
 * voice that picks up something real from their life and asks one question it doesn't know yet.
 * Their answer is learned into memory like any reply, so the People page updates by itself.
 *
 * Limits: only friend/close contacts (your setting), only within Instagram's 24-hour window after
 * THEIR last message (Instagram blocks messages after that), never two in a row without an answer,
 * and a daily cap per account (your setting). Any hour of the day.
 */
const UserMemory = require('../models/UserMemory');
const PersonaConfig = require('../models/PersonaConfig');
const Message = require('../models/Message');
const instagramService = require('./instagramService');
const azureOpenAI = require('./azureOpenAI');
const socialGraphService = require('./socialGraphService');
const storyboardService = require('./storyboardService');
const { computeCloseness } = require('./closeness');
const { splitIntoBubbles, bubbleGapMs } = require('./humanizeService');
const { aiRepliesTo } = require('../frontend/app/lib/aiReplyRules');

const { checkInDecision, nextQuestionTopic, awayState, WINDOW_HOURS, HOUR, MAX_PER_RUN } = require('./checkInRules');

async function ownerAccountToken(ownerId) {
  try {
    const { getOwnerSendToken } = require('./instagramTokenService');
    return await getOwnerSendToken(ownerId);
  } catch {
    return '';
  }
}

class CheckInService {
  constructor() { this.running = false; this.timer = null; }

  startScheduler(minutes = 20) {
    if (this.timer) return;
    const tick = () => this.run()
      .then(sent => console.log(`💬 [Check-in] Pass done: ${sent || 0} sent`))
      .catch(err => console.error('❌ [Check-in]', err.message));
    this.timer = setInterval(tick, minutes * 60 * 1000);
    if (this.timer.unref) this.timer.unref();
    // First pass 2 minutes after start: a restart or deploy must not push check-ins back 20 minutes
    const first = setTimeout(tick, 2 * 60 * 1000);
    if (first.unref) first.unref();
    console.log(`💬 [Check-in] Scheduler every ${minutes} min`);
  }

  async run() {
    if (this.running) return;
    this.running = true;
    let sent = 0;
    try {
      const now = Date.now();
      const candidates = await UserMemory.find({
        aiEnabled: true,
        replyToMessages: { $ne: false },
        handoffRequestedAt: null,
        senderId: { $not: /^test_/ },
        lastInteraction: { $gte: new Date(now - WINDOW_HOURS * HOUR), $lte: new Date(now - 2 * HOUR) },
      }).limit(200);
      const configs = new Map();
      for (const mem of candidates) {
        if (sent >= MAX_PER_RUN) break;
        try {
          if (await this.considerOne(mem, { now, configs })) sent++;
        } catch (err) {
          console.warn(`⚠️ [Check-in] ${mem.name || mem.senderId}:`, err.message);
        }
      }
    } finally {
      this.running = false;
    }
    return sent;
  }

  async considerOne(mem, { now, configs }) {
    const key = String(mem.ownerId || 'legacy');
    if (!configs.has(key)) configs.set(key, await PersonaConfig.findOne({ ownerId: mem.ownerId || null }).lean());
    const config = configs.get(key);
    if (!config || config.checkInsEnabled === false || config.globalBotActive === false) return false;
    if (config.accountType && config.accountType !== 'personal') return false;
    if (!aiRepliesTo({ senderId: mem.senderId, handle: mem.username, name: mem.name, aiEnabled: mem.aiEnabled, replyToMessages: mem.replyToMessages }, config, { includeGlobal: true })) return false;

    const convo = { ownerId: mem.ownerId || null, $or: [{ senderId: mem.senderId }, { recipientId: mem.senderId }] };
    const [lastAny, lastTheirs, sentToday, node, circle] = await Promise.all([
      Message.findOne(convo).sort({ createdAt: -1 }).lean(),
      Message.findOne({ ownerId: mem.ownerId || null, senderId: mem.senderId, role: 'user' }).sort({ createdAt: -1 }).lean(),
      Message.countDocuments({ ownerId: mem.ownerId || null, isCheckIn: true, createdAt: { $gte: new Date(now - 24 * HOUR) } }),
      socialGraphService.getNode(mem.ownerId || null, mem.senderId),
      storyboardService.getContactCircle(mem.ownerId, mem),
    ]);
    const closeness = computeCloseness({
      category: node?.category, relationshipToSam: node?.relationshipToSam, circle,
      relationshipType: mem.relationshipType, chatsCount: node?.chatsCount || mem.messageCount,
      firstSeen: mem.createdAt, lastSeen: mem.lastInteraction, override: node?.closenessOverride || '',
      familyRole: socialGraphService.familyRole,
    }, now);
    const away = awayState(mem.away, now);
    const decision = checkInDecision({
      away: away.state,
      enabled: config.checkInsEnabled !== false,
      level: closeness.level,
      minLevel: config.checkInMinLevel || 'close',
      lastTheirsAt: lastTheirs?.createdAt,
      lastAnyAt: lastAny?.createdAt,
      lastAnyRole: lastAny?.role,
      lastAnyWasCheckIn: !!lastAny?.isCheckIn,
      lastCheckInAt: mem.lastCheckInAt,
      idleHours: config.checkInIdleHours || 4,
      sentToday,
      dailyLimit: config.checkInDailyLimit || 6,
      now,
    });
    if (!decision.ok) return false;

    const token = await ownerAccountToken(mem.ownerId);
    if (!token) return false;

    const history = (await Message.find(convo).sort({ createdAt: -1 }).limit(12).lean()).reverse();
    // Back from studying / going out: the natural check-in is how it went
    const ask = away.state === 'justBack'
      ? { topic: 'back from being busy', hint: `how their ${away.reason} went (they said earlier they were going for ${away.reason}); welcome them back` }
      : nextQuestionTopic(mem);
    const memoryDoc = (await require('../models/PersonMemory').findOne({ ownerId: mem.ownerId || null, senderId: mem.senderId }, { doc: 1 }).lean().catch(() => null))?.doc || '';
    const out = await azureOpenAI.generateCheckIn({ userMemory: mem, messageHistory: history, config, closeness, ask, node, memoryDoc });
    if (!out?.message) return false;

    // Claim first so two servers never both write to the same person
    const claimed = await UserMemory.findOneAndUpdate(
      { _id: mem._id, lastCheckInAt: mem.lastCheckInAt || null },
      { $set: { lastCheckInAt: new Date(), pendingQuestion: { text: out.question || '', topic: ask.topic, askedAt: new Date() } } },
      { returnDocument: 'after' },
    );
    if (!claimed) return false;

    const bubbles = splitIntoBubbles(out.message);
    let first = null;
    for (const [i, bubble] of bubbles.entries()) {
      if (i) await new Promise(r => setTimeout(r, bubbleGapMs()));
      const res = await instagramService.sendTextMessage(mem.senderId, bubble, token).catch(err => ({ success: false, error: err.message }));
      if (!res?.success) {
        if (i === 0) {
          await UserMemory.updateOne({ _id: mem._id }, { $set: { lastCheckInAt: mem.lastCheckInAt || null, pendingQuestion: mem.pendingQuestion || {} } }).catch(() => {});
          console.warn(`⚠️ [Check-in] Not delivered to ${mem.name || mem.senderId}`);
          return false;
        }
        break;
      }
      first = first || res;
      await Message.create({
        ownerId: mem.ownerId || null, senderId: 'me', recipientId: mem.senderId, role: 'assistant',
        text: bubble, mid: res?.data?.message_id || `checkin_${Date.now()}_${i}`,
        sentByAI: true, isCheckIn: true, timestamp: new Date(),
      });
    }
    console.log(`💬 [Check-in] ${mem.name || mem.senderId} (${closeness.level} ${closeness.score}): asked about ${ask.topic}`);
    return true;
  }
}

const service = new CheckInService();
module.exports = service;
module.exports.checkInDecision = checkInDecision;
module.exports.nextQuestionTopic = nextQuestionTopic;
