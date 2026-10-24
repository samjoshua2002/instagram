const UserMemory = require('../models/UserMemory');
const Message = require('../models/Message');
const PersonaConfig = require('../models/PersonaConfig');
const User = require('../models/User');
const workspaceFeatureService = require('./workspaceFeatureService');
const instagramService = require('./instagramService');
const { getOwnerSendToken } = require('./instagramTokenService');
const azureOpenAI = require('./azureOpenAI');

class ReminderService {
  /**
   * Scans for conversations that have been inactive for 5-6 hours
   * and sends an authentic, friendly follow-up check-in.
   */
  async checkAndSendReminders() {
    try {
      const maxInactiveMs = 10 * 60 * 60 * 1000; // Strictly capped at 10 hours max (if idle for 1 day or >=10h, do NOT remind them - wait until they text)
      const now = Date.now();
      const policyCutoff = new Date(now - maxInactiveMs);

      // Find candidates who interacted between 1 and 10 hours ago; each owner's own delay is applied below
      const candidateUsers = await UserMemory.find({
        aiEnabled: true,
        remindersEnabled: { $ne: false },
        handoffRequestedAt: null,
        lastInteraction: { $gte: policyCutoff, $lte: new Date(now - 60 * 60 * 1000) },
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
    }
  }

  /**
   * The contact owner's persona and workspace mode (legacy contacts without an owner use the admin persona)
   */
  async loadOwner(ownerId, ownerCache) {
    const key = String(ownerId || '');
    if (!ownerCache.has(key)) {
      const config = ownerId
        ? await PersonaConfig.findOne({ ownerId })
        : (await PersonaConfig.findOne({ ownerId: null })) || (await PersonaConfig.findOne());
      const ownerUser = ownerId ? await User.findById(ownerId) : null;
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

    const reminderHours = config.reminderAfterHours || 5;
    if (new Date(user.lastInteraction).getTime() > now - reminderHours * 60 * 60 * 1000) return;

    // Avoid sending another reminder if one was already sent after their last interaction
    if (user.lastReminderSentAt && user.lastReminderSentAt >= user.lastInteraction) return;

    // Check the most recent message in the conversation
    const lastMsg = await Message.findOne({
      $or: [{ senderId: user.senderId }, { recipientId: user.senderId }]
    }).sort({ createdAt: -1 });

    // If the last message was from the bot/assistant (user left on seen/read), DO NOT double-text like a bot
    if (lastMsg && lastMsg.role === 'assistant') return;

    // Fetch recent conversation history for context
    const history = await Message.find({
      $or: [{ senderId: user.senderId }, { recipientId: user.senderId }]
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

    // Generate warm, casual follow-up in the owner's own voice
    const reminderText = await azureOpenAI.generateFollowUpReminder({
      userMemory: user,
      messageHistory: history,
      config,
    });
    if (!reminderText) return;

    // Send with the contact owner's token; never the admin token for a tenant's contact
    const ownerToken = await getOwnerSendToken(user.ownerId);
    if (ownerToken === '') {
      console.warn(`⚠️ [Reminder Service] Skipping @${user.username}: owner's Instagram is not connected.`);
      return;
    }
    const sendResult = await instagramService.sendTextMessage(user.senderId, reminderText, ownerToken);

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

    // Update user memory so no duplicate reminders are sent
    user.lastReminderSentAt = new Date();
    await user.save();

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
