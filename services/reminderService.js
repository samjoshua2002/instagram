const UserMemory = require('../models/UserMemory');
const Message = require('../models/Message');
const PersonaConfig = require('../models/PersonaConfig');
const User = require('../models/User');
const instagramService = require('./instagramService');
const azureOpenAI = require('./azureOpenAI');

class ReminderService {
  /**
   * Runs the follow-up check separately for every creator, each with their own
   * persona, rules and Instagram token. Never uses one creator's token for another.
   */
  async checkAndSendReminders() {
    try {
      const configs = await PersonaConfig.find({ ownerId: { $ne: null } });
      for (const config of configs) {
        const owner = await User.findById(config.ownerId);
        if (!owner) continue;
        const token = config.instagramPageAccessToken || owner.instagramPageAccessToken;
        if (!token) continue;
        await this.checkRemindersForOwner(owner, config, token);
      }
    } catch (err) {
      console.error('❌ Error in checkAndSendReminders:', err.message);
    }
  }

  async checkRemindersForOwner(owner, config, token) {
    try {
      if (!config.globalBotActive || config.chatMode === 'paused') {
        return;
      }
      if (config.followUpReminderEnabled === false) {
        return;
      }

      const reminderHours = config?.reminderAfterHours || 5;
      const minInactiveMs = reminderHours * 60 * 60 * 1000; // 5 hours
      const maxInactiveMs = 10 * 60 * 60 * 1000; // Strictly capped at 10 hours max (if idle for 1 day or >=10h, do NOT remind them - wait until they text)

      const now = Date.now();
      const cutoffTime = new Date(now - minInactiveMs);
      const policyCutoff = new Date(now - maxInactiveMs);

      // Find candidates who interacted between 5 hours and 10 hours ago
      const candidateUsers = await UserMemory.find({
        ownerId: owner._id,
        aiEnabled: true,
        remindersEnabled: { $ne: false },
        lastInteraction: { $gte: policyCutoff, $lte: cutoffTime },
      });

      const botAccountId = config.instagramAccountId || owner.instagramAccountId || (owner.role === 'superadmin' ? process.env.INSTAGRAM_ACCOUNT_ID : '') || '';
      const excluded = new Set(config.excludedContactIds || []);
      const included = new Set(config.includedContactIds || []);

      for (const user of candidateUsers) {
       try {
        // Do not send reminders to the bot itself or known non-contacts
        if (user.senderId === botAccountId || user.senderId === '17841445731016310') {
          continue;
        }

        // Respect this creator's chat rules
        if (config.chatMode === 'everyone_except' && excluded.has(user.senderId)) continue;
        if (config.chatMode === 'only_selected' && !included.has(user.senderId)) continue;

        // Avoid sending another reminder if one was already sent after their last interaction
        if (user.lastReminderSentAt && user.lastReminderSentAt >= user.lastInteraction) {
          continue;
        }

        // Check the most recent message in the conversation
        const convoQuery = { ownerId: owner._id, $or: [{ senderId: user.senderId }, { recipientId: user.senderId }] };
        const lastMsg = await Message.findOne(convoQuery).sort({ createdAt: -1 });

        // If the last message was from the bot/assistant (user left on seen/read), DO NOT double-text like a bot
        if (lastMsg && lastMsg.role === 'assistant') {
          continue;
        }

        // Fetch recent conversation history for context
        const history = await Message.find(convoQuery).sort({ createdAt: -1 }).limit(8);
        history.reverse();

        // Effort check: do not remind low-effort / dry responders
        const userMsgs = history.filter(m => m.role === 'user');
        const lastUserMsg = userMsgs[userMsgs.length - 1];
        if (!lastUserMsg || (lastUserMsg.text && lastUserMsg.text.trim().length <= 5 && !lastUserMsg.text.includes('?'))) {
          console.log(`⏸️ [Reminder Service] Skipping @${user.username}: low effort or dry message.`);
          continue;
        }

        console.log(`⏰ [Reminder Service] Generating genuine follow-up for engaged user @${user.username} (${user.senderId})...`);

        // Generate warm, casual follow-up
        const reminderText = await azureOpenAI.generateFollowUpReminder({
          userMemory: user,
          messageHistory: history,
          config,
        });

        if (!reminderText) {
          continue;
        }

        // Send via Instagram Graph API
        const sendResult = await instagramService.sendTextMessage(user.senderId, reminderText, token);

        if (!sendResult || sendResult.success !== true) {
          console.warn(`⚠️ [Reminder] Not delivered to ${user.senderId}; will retry next cycle.`);
          continue;
        }

        // Record reminder in DB
        await Message.record({
          ownerId: owner._id,
          senderId: botAccountId,
          recipientId: user.senderId,
          role: 'assistant',
          text: reminderText,
          mid: sendResult?.data?.message_id || `remind_${Date.now()}`,
          sentByAI: true,
          isReminder: true,
          timestamp: new Date(),
        }, { update: { sentByAI: true, isReminder: true } });

        // Update user memory so no duplicate reminders are sent
        await UserMemory.updateOne({ _id: user._id }, { $set: { lastReminderSentAt: new Date() } });

        console.log(`✅ [Follow-up Reminder Sent] to @${user.username}: "${reminderText}"`);
       } catch (contactErr) {
        // One contact failing must not stop reminders for this creator's other contacts
        console.error(`❌ Reminder failed for contact ${user?.senderId}:`, contactErr.message);
       }
      }
    } catch (err) {
      console.error(`❌ Error in reminders for creator ${owner?.username}:`, err.message);
    }
  }

  /**
   * Starts periodic background checker
   */
  startScheduler(intervalMinutes = 15) {
    console.log(`⏱️ Reminder scheduler active: checking every ${intervalMinutes}m for 5-6h inactive conversations.`);
    // Run an initial scan 1 minute after server starts
    // One run at a time: a slow run (AI + sends for many contacts) must not overlap the next tick,
    // or both could see the same contact as due and send it two reminders
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try { await this.checkAndSendReminders(); } catch (err) { console.error('❌ Reminder run failed:', err.message); }
      finally { running = false; }
    };
    setTimeout(run, 60 * 1000);
    // Recurring interval check
    setInterval(run, intervalMinutes * 60 * 1000);
  }
}

module.exports = new ReminderService();
