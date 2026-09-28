const UserMemory = require('../models/UserMemory');
const Message = require('../models/Message');
const PersonaConfig = require('../models/PersonaConfig');
const instagramService = require('./instagramService');
const azureOpenAI = require('./azureOpenAI');

class ReminderService {
  /**
   * Scans for conversations that have been inactive for 5-6 hours
   * and sends an authentic, friendly follow-up check-in.
   */
  async checkAndSendReminders() {
    try {
      const config = await PersonaConfig.findOne();
      if (config && !config.globalBotActive) {
        return;
      }
      if (config && config.followUpReminderEnabled === false) {
        return;
      }

      const reminderHours = config?.reminderAfterHours || 5;
      const minInactiveMs = reminderHours * 60 * 60 * 1000; // 5 hours
      const maxInactiveMs = 23 * 60 * 60 * 1000; // 23 hours (strictly within Meta's 24h standard messaging window)

      const now = Date.now();
      const cutoffTime = new Date(now - minInactiveMs);
      const policyCutoff = new Date(now - maxInactiveMs);

      // Find candidates who interacted between 5 hours and 23 hours ago
      const candidateUsers = await UserMemory.find({
        aiEnabled: true,
        lastInteraction: { $gte: policyCutoff, $lte: cutoffTime },
      });

      const botAccountId = process.env.INSTAGRAM_ACCOUNT_ID || '17841446877896232';

      for (const user of candidateUsers) {
        // Do not send reminders to the bot itself or known non-contacts
        if (user.senderId === botAccountId || user.senderId === '17841445731016310') {
          continue;
        }

        // Avoid sending another reminder if one was already sent after their last interaction
        if (user.lastReminderSentAt && user.lastReminderSentAt >= user.lastInteraction) {
          continue;
        }

        // Check the most recent message in the conversation
        const lastMsg = await Message.findOne({
          $or: [{ senderId: user.senderId }, { recipientId: user.senderId }]
        }).sort({ createdAt: -1 });

        // If the last message was already a reminder, do not send another one
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isReminder) {
          continue;
        }

        // Fetch recent conversation history for context
        const history = await Message.find({
          $or: [{ senderId: user.senderId }, { recipientId: user.senderId }]
        }).sort({ createdAt: -1 }).limit(6);
        history.reverse();

        console.log(`⏰ [Reminder Service] Generating 5-6h follow-up check-in for @${user.username} (${user.senderId})...`);

        // Generate warm, casual follow-up
        const reminderText = await azureOpenAI.generateFollowUpReminder({
          userMemory: user,
          messageHistory: history,
        });

        if (!reminderText) {
          continue;
        }

        // Send via Instagram Graph API
        const sendResult = await instagramService.sendTextMessage(user.senderId, reminderText);

        // Record reminder in DB
        await Message.create({
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
    } catch (err) {
      console.error('❌ Error in checkAndSendReminders:', err.message);
    }
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
  }
}

module.exports = new ReminderService();
