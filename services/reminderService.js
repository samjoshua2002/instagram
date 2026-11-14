const UserMemory = require('../models/UserMemory');
const Message = require('../models/Message');
const PersonaConfig = require('../models/PersonaConfig');
const User = require('../models/User');
const workspaceFeatureService = require('./workspaceFeatureService');
const instagramService = require('./instagramService');
const { getOwnerSendToken } = require('./instagramTokenService');
const azureOpenAI = require('./azureOpenAI');

const {
  HOUR_MS, REMINDER_GRACE_HOURS, MAX_REMINDER_AFTER_HOURS, DEFAULT_TIMEZONE,
  localHour, isQuietHours, reminderDelayHours, isWithinReminderWindow,
} = require('./reminderSchedule');

class ReminderService {
  constructor() {
    this.running = false;
  }

  /**
   * Scans for conversations that have been inactive for the owner's delay (default 5h)
   * and sends an authentic, friendly follow-up check-in. Runs never overlap.
   */
  async checkAndSendReminders() {
    if (this.running) {
      console.log('⏭️ [Reminder Service] Previous run still in progress; skipping this tick.');
      return;
    }
    this.running = true;
    try {
      const now = Date.now();
      // Widest possible window; each owner's own delay and grace window are applied in remindOne
      const policyCutoff = new Date(now - (MAX_REMINDER_AFTER_HOURS + REMINDER_GRACE_HOURS) * HOUR_MS);

      const candidateUsers = await UserMemory.find({
        aiEnabled: true,
        replyToMessages: { $ne: false },
        remindersEnabled: { $ne: false },
        handoffRequestedAt: null,
        lastInteraction: { $gte: policyCutoff, $lte: new Date(now - HOUR_MS) },
      });

      const botAccountId = process.env.INSTAGRAM_ACCOUNT_ID || '17841446877896232';
      const ownerCache = new Map();

      for (const user of candidateUsers) {
        // One failing contact must not stop reminders for everyone after it
        try {
          await this.remindOne(user, { now, botAccountId, ownerCache });
        } catch (err) {
          console.error(`❌ [Reminder Service] @${user.username}:`, err.message);
        }
      }
    } catch (err) {
      console.error('❌ Error in checkAndSendReminders:', err.message);
    } finally {
      this.running = false;
    }
  }

  /**
   * The contact owner's persona and workspace mode (legacy contacts without an owner use the
   * legacy admin persona, ownerId null — never an arbitrary tenant's persona)
   */
  async loadOwner(ownerId, ownerCache) {
    const key = String(ownerId || '');
    if (!ownerCache.has(key)) {
      const ownerUser = ownerId ? await User.findById(ownerId) : null;
      // Live replies for the superadmin fall back to the legacy persona, so reminders do too
      const config = await PersonaConfig.findOne({ ownerId: ownerId || null })
        || (ownerUser?.role === 'superadmin' ? await PersonaConfig.findOne({ ownerId: null }) : null);
      const features = ownerUser ? await workspaceFeatureService.getFeaturesSafe(ownerUser) : null;
      ownerCache.set(key, { config, activeMode: features?.activeMode || 'personal' });
    }
    return ownerCache.get(key);
  }

  async remindOne(user, { now, botAccountId, ownerCache }) {
    // Do not send reminders to the bot itself or known non-contacts
    if (user.senderId === botAccountId || user.senderId === '17841445731016310') return;

    // Same switches as live replies: paused bot, chat mode lists, reminders off, business workspaces
    const { config, activeMode } = await this.loadOwner(user.ownerId, ownerCache);
    if (!config || !config.globalBotActive || config.chatMode === 'paused') return;
    if (config.followUpReminderEnabled === false || activeMode === 'business') return;
    if (config.chatMode === 'everyone_except' && (config.excludedContactIds || []).includes(user.senderId)) return;
    if (config.chatMode === 'only_selected' && !(config.includedContactIds || []).includes(user.senderId)) return;

    if (!isWithinReminderWindow(user.lastInteraction, now, reminderDelayHours(config))) return;

    // Quiet hours in the owner's time zone: try again on a later tick
    const timeZone = config.businessPolicy?.timezone || DEFAULT_TIMEZONE;
    if (isQuietHours(new Date(now), timeZone)) return;

    // Avoid sending another reminder if one was already sent after their last interaction
    if (user.lastReminderSentAt && user.lastReminderSentAt >= user.lastInteraction) return;

    // Check the most recent message in the conversation
    const lastMsg = await Message.findOne({
      ownerId: user.ownerId || null, $or: [{ senderId: user.senderId }, { recipientId: user.senderId }]
    }).sort({ createdAt: -1 });

    // If the last message was from the bot/assistant (user left on seen/read), DO NOT double-text like a bot
    if (lastMsg && lastMsg.role === 'assistant') return;

    // Fetch recent conversation history for context
    const history = await Message.find({
      ownerId: user.ownerId || null, $or: [{ senderId: user.senderId }, { recipientId: user.senderId }]
    }).sort({ createdAt: -1 }).limit(8);
    history.reverse();

    // Effort check: do not remind low-effort / dry responders
    const userMsgs = history.filter(m => m.role === 'user');
    const lastUserMsg = userMsgs[userMsgs.length - 1];
    if (!lastUserMsg || (lastUserMsg.text && lastUserMsg.text.trim().length <= 5 && !lastUserMsg.text.includes('?'))) {
      console.log(`⏸️ [Reminder Service] Skipping @${user.username}: low effort or dry message.`);
      return;
    }

    console.log(`⏰ [Reminder Service] Generating genuine follow-up for engaged user @${user.username} (${user.senderId})...`);

    // Send with the contact owner's token; never the admin token for a tenant's contact.
    // Checked before writing the message so a disconnected account costs no AI call.
    const ownerToken = await getOwnerSendToken(user.ownerId);
    if (ownerToken === '') {
      console.warn(`⚠️ [Reminder Service] Skipping @${user.username}: owner's Instagram is not connected.`);
      return;
    }

    // Generate warm, casual follow-up in the owner's own voice
    const reminderText = await azureOpenAI.generateFollowUpReminder({
      userMemory: user,
      messageHistory: history,
      config,
    });
    if (!reminderText) return;
    // Claim the contact atomically: only succeeds if nobody (another run / server instance) sent or
    // claimed a reminder since we read it, and they have not texted again in the meantime.
    const previousSentAt = user.lastReminderSentAt || null;
    const claimedAt = new Date();
    const claimed = await UserMemory.findOneAndUpdate(
      { _id: user._id, lastReminderSentAt: previousSentAt, lastInteraction: user.lastInteraction },
      { $set: { lastReminderSentAt: claimedAt } },
      { returnDocument: 'after' }
    );
    if (!claimed) {
      console.log(`⏭️ [Reminder Service] @${user.username} already claimed or active again; skipping.`);
      return;
    }

    const sendResult = await instagramService.sendTextMessage(user.senderId, reminderText, ownerToken)
      .catch(err => ({ success: false, error: err.message }));
    if (!sendResult?.success) {
      // Not delivered: release the claim (only if it is still ours) so a later run can retry.
      // Permanent errors (expired token, no permission, user unreachable) keep the claim, so the
      // same contact is not re-written by the AI every 15 minutes.
      const igErr = sendResult?.error?.error || sendResult?.error || {};
      const permanent = [10, 190, 200, 551].includes(Number(igErr.code)) ||
        [2018278, 2534022].includes(Number(igErr.error_subcode));
      if (!permanent) await UserMemory.updateOne(
        { _id: user._id, lastReminderSentAt: claimedAt },
        { $set: { lastReminderSentAt: previousSentAt } }
      ).catch(() => {});
      console.warn(`⚠️ [Reminder Service] Send to @${user.username} failed; not recorded:`, sendResult?.error || sendResult?.reason || 'unknown error');
      return;
    }

    // Record reminder in DB
    await Message.create({
      ownerId: user.ownerId || null,
      senderId: botAccountId,
      recipientId: user.senderId,
      role: 'assistant',
      text: reminderText,
      mid: sendResult?.data?.message_id || `remind_${Date.now()}`,
      sentByAI: true,
      isReminder: true,
      timestamp: new Date(),
    });

    // lastReminderSentAt was already set by the claim above, so no duplicate reminders are sent
    user.lastReminderSentAt = claimedAt;

    console.log(`✅ [Follow-up Reminder Sent] to @${user.username}: "${reminderText}"`);
  }

  /**
   * Starts periodic background checker
   */
  startScheduler(intervalMinutes = 15) {
    console.log(`⏱️ Reminder scheduler active: checking every ${intervalMinutes}m for 5-6h inactive conversations.`);
    // Run an initial scan 1 minute after server starts
    setTimeout(() => this.checkAndSendReminders(), 60 * 1000);
    // Recurring interval check
    setInterval(() => this.checkAndSendReminders(), intervalMinutes * 60 * 1000);
    this.startTokenRefreshScheduler();
  }

  /**
   * Daily Meta token refresh: tokens expiring within 15 days are refreshed and re-encrypted
   */
  startTokenRefreshScheduler() {
    const tokenHealthService = require('./tokenHealthService');
    const run = () => tokenHealthService.runDailyRefresh().catch(err => console.error('❌ [TokenRefresh] Job failed:', err.message));
    setTimeout(run, 5 * 60 * 1000);
    setInterval(run, 24 * 60 * 60 * 1000);
  }
}

module.exports = new ReminderService();
Object.assign(module.exports, { isQuietHours, localHour, reminderDelayHours, isWithinReminderWindow });
