require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

// Models
const UserMemory = require('./models/UserMemory');
const Message = require('./models/Message');
const PersonaConfig = require('./models/PersonaConfig');

// Services
const instagramService = require('./services/instagramService');
const azureOpenAI = require('./services/azureOpenAI');
const memoryService = require('./services/memoryService');
const reminderService = require('./services/reminderService');
const stickerService = require('./services/stickerService');
const socialGraphService = require('./services/socialGraphService');
const SocialGraph = require('./models/SocialGraph');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

function escapeRegex(string) {
  return (string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Webhook Verification Token
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'chatter_instagram_secret_2025';

// Cache for recent message IDs to prevent duplicate processing
const processedMids = new Set();

// Anti-spam debounce queue: aggregates rapid-fire/spam messages and replies once
const userDebounceQueues = new Map();
const DEBOUNCE_WAIT_MS = 3500; // Hold on for 3.5s to see if user is typing multiple quick messages / spamming

/**
 * ---------------------------------------------------------------------
 * 1. META / INSTAGRAM WEBHOOK ENDPOINTS
 * ---------------------------------------------------------------------
 */

// GET /webhook: Webhook verification challenge from Meta
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log(`📡 Webhook challenge received. Mode: ${mode}, Token: ${token}`);

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified successfully by Meta!');
      return res.status(200).send(challenge);
    } else {
      console.warn('❌ Webhook verification failed. Token mismatch.');
      return res.sendStatus(403);
    }
  }
  res.sendStatus(400);
});

// Helper to parse message text, reels, posts, story replies, notes, and media attachments
function parseIncomingEventMessage(msg) {
  if (!msg || msg.is_echo) return null;

  let text = (msg.text || '').trim();
  let isReelOrShare = false;
  let isPost = false;
  let isMedia = false;
  let mediaTitle = '';
  let isStoryReply = false;
  let isNoteReply = false;

  // Check if replying to a Story
  if (msg.reply_to?.story || msg.story) {
    isStoryReply = true;
  }

  // Check if replying to a Note
  if (msg.reply_to?.note || msg.note) {
    isNoteReply = true;
  }

  if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
    for (const att of msg.attachments) {
      const type = (att.type || '').toLowerCase();
      const url = att.payload?.url || '';
      const title = att.payload?.title || att.payload?.caption || att.payload?.name || '';

      if (type === 'ig_reel' || type === 'reel' || url.includes('/reel/') || url.includes('/reels/')) {
        isReelOrShare = true;
        mediaTitle = title;
      } else if (type === 'ig_post' || type === 'post' || url.includes('/p/') || url.includes('/tv/')) {
        isPost = true;
        isReelOrShare = true;
        mediaTitle = title;
      } else if (type === 'share') {
        if (url.includes('/reel/') || url.includes('/reels/')) {
          isReelOrShare = true;
        } else {
          isPost = true;
          isReelOrShare = true;
        }
        mediaTitle = title;
      } else if (type === 'story_mention' || type === 'story') {
        isStoryReply = true;
        mediaTitle = 'Mentioned you in their Story';
      } else if (type === 'image') {
        isMedia = true;
        mediaTitle = 'Photo';
      } else if (type === 'video') {
        isMedia = true;
        mediaTitle = 'Video';
      } else if (type === 'audio') {
        isMedia = true;
        mediaTitle = 'Voice message';
      }
    }
  }

  // Format incoming text with context
  if (isStoryReply) {
    text = text ? `[Replied to your Instagram Story: "${text}"]` : `[Reacted to your Instagram Story with an emoji]`;
  } else if (isNoteReply) {
    text = text ? `[Replied to your Instagram Note: "${text}"]` : `[Reacted to your Instagram Note]`;
  } else if (isPost) {
    text = text
      ? `${text} [Shared an Instagram Post: "${mediaTitle || 'Post'}"]`
      : (mediaTitle ? `[Shared an Instagram Post: "${mediaTitle}"]` : `[Shared an Instagram Post]`);
  } else if (isReelOrShare) {
    text = text
      ? `${text} [Shared an Instagram Reel: "${mediaTitle || 'Reel'}"]`
      : (mediaTitle ? `[Shared an Instagram Reel: "${mediaTitle}"]` : `[Shared an Instagram Reel]`);
  } else if (isMedia) {
    text = text ? `${text} [Sent a ${mediaTitle}]` : `[Sent a ${mediaTitle}]`;
  }

  // If there's neither text nor post/reel/story, skip
  if (!text) return null;

  return { text, isReelOrShare, reelTitle: mediaTitle, isStoryReply, isNoteReply };
}

// Helper to record messages sent manually by the creator from the Instagram phone app
function handleCreatorEcho(event, accountId) {
  const botAccountId = process.env.INSTAGRAM_ACCOUNT_ID || '17841446877896232';
  const contactId = event.recipient?.id;
  if (!contactId || contactId === botAccountId) return;

  const text = event.message?.text || (event.message?.attachments?.length ? '[Shared Media / Sticker]' : '');
  const mid = event.message?.mid || `echo_${Date.now()}`;
  console.log(`📱 [Creator Echo]: Sam manually replied to ${contactId}: "${text}"`);

  // Cancel any active AI debounce queue so the bot doesn't reply over the creator
  if (userDebounceQueues.has(contactId)) {
    clearTimeout(userDebounceQueues.get(contactId).timer);
    userDebounceQueues.delete(contactId);
    console.log(`🛑 [Creator Intervened]: Cancelled pending AI auto-reply for ${contactId}`);
  }

  // Record outgoing message in DB
  Message.create({
    senderId: botAccountId,
    recipientId: contactId,
    role: 'assistant',
    text: text || '[Media]',
    mid,
    sentByAI: false,
    timestamp: new Date(),
  }).catch(() => {});

  // Update contact's memory: fresh interaction reactivates the conversation & resets reminder cycle
  UserMemory.updateOne({ senderId: contactId }, {
    lastInteraction: new Date(),
    lastReminderSentAt: null,
    $inc: { messageCount: 1 }
  }).catch(() => {});
}

// POST /webhook: Incoming Instagram Events (DMs, echoes, reels, etc.)
app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log(`📥 [Webhook Event Received]:`, JSON.stringify(body));

  // Immediately respond 200 OK so Meta doesn't retry
  res.status(200).send('EVENT_RECEIVED');

  for (const entry of body.entry || []) {
    // Format 1: Classic entry.messaging format
    if (Array.isArray(entry.messaging)) {
      for (const event of entry.messaging) {
        if (event.message?.is_echo) {
          handleCreatorEcho(event, entry.id);
          continue;
        }

        const parsed = parseIncomingEventMessage(event.message);
        if (parsed) {
          event.message.text = parsed.text;
          event.isReelOrShare = parsed.isReelOrShare;
          event.reelTitle = parsed.reelTitle;
          handleIncomingInstagramMessage(event, entry.id).catch(err => {
            console.error('Error handling incoming Instagram message:', err);
          });
        }
      }
    }

    // Format 2: Instagram Login entry.changes format (version 26.0)
    if (Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        if (change.field === 'messages' && change.value) {
          const val = change.value;
          if (val.message?.is_echo) {
            handleCreatorEcho({ sender: val.sender, recipient: val.recipient, message: val.message }, entry.id);
            continue;
          }

          const parsed = parseIncomingEventMessage(val.message);
          if (parsed) {
            val.message.text = parsed.text;
            handleIncomingInstagramMessage({
              sender: val.sender,
              recipient: val.recipient,
              timestamp: val.timestamp,
              message: val.message,
              isReelOrShare: parsed.isReelOrShare,
              reelTitle: parsed.reelTitle,
            }, entry.id).catch(err => {
              console.error('Error handling incoming Instagram change event:', err);
            });
          }
        }
      }
    }
  }
});


/**
 * Core processing logic for an incoming Instagram DM
 */
async function handleIncomingInstagramMessage(event, accountId = null) {
  const senderId = event.sender.id;
  const recipientId = event.recipient.id;
  const messageText = event.message.text;
  const mid = event.message.mid;
  const isReelOrShare = event.isReelOrShare;

  const botAccountId = process.env.INSTAGRAM_ACCOUNT_ID || '17841446877896232';

  // Only your account should respond with AI: ignore events for other accounts (e.g. moi)
  if (accountId && accountId !== botAccountId && recipientId !== botAccountId) {
    console.log(`⏸️ Skipping: event is for account ${accountId || recipientId}, not primary bot ${botAccountId}`);
    return;
  }

  // Prevent bot from replying to itself
  if (senderId === botAccountId) {
    return;
  }

  // Deduplication check (bypass for test random_mid)
  if (mid && mid !== 'random_mid' && processedMids.has(mid)) {
    console.log(`⚠️ Duplicate mid detected: ${mid}, skipping.`);
    return;
  }
  if (mid && mid !== 'random_mid') {
    processedMids.add(mid);
    if (processedMids.size > 2000) {
      const firstKey = processedMids.keys().next().value;
      processedMids.delete(firstKey);
    }
  }

  console.log(`\n💬 [Incoming DM] From: ${senderId} | Text: "${messageText}"`);

  // Safe timestamp parser
  let msgTime = new Date();
  if (event.timestamp) {
    const num = Number(event.timestamp);
    if (!isNaN(num)) {
      msgTime = new Date(num > 1e11 ? num : num * 1000);
    }
  }

  // 1. Fetch persona & global settings
  let config = await PersonaConfig.findOne();
  if (!config) {
    config = await PersonaConfig.create({});
  }

  // 2. Fetch or create user memory
  let userProfile = null;
  try {
    userProfile = await instagramService.getUserProfile(senderId);
  } catch (e) {
    // ignore
  }
  const userMemory = await memoryService.getOrCreateUserMemory(senderId, userProfile);

  // 3. Save incoming user message in DB
  await Message.create({
    senderId,
    recipientId,
    role: 'user',
    text: messageText,
    mid: mid === 'random_mid' ? `test_${Date.now()}` : mid,
    timestamp: msgTime,
  });

  // Re-activate conversation: update lastInteraction and clear lastReminderSentAt
  userMemory.lastInteraction = msgTime;
  userMemory.lastReminderSentAt = null; // Sending a message re-activates reminder eligibility for future idle moments
  userMemory.messageCount = (userMemory.messageCount || 0) + 1;
  await userMemory.save();

  // 4. Check if Bot is enabled globally or paused
  if (!config.globalBotActive || config.chatMode === 'paused') {
    console.log(`⏸️ Global Bot is paused (mode: ${config.chatMode || 'paused'}). Message saved to inbox, skipping auto-reply.`);
    return;
  }

  // Check chat routing mode: 'everyone', 'everyone_except', 'only_selected'
  if (config.chatMode === 'everyone_except') {
    if ((config.excludedContactIds || []).includes(senderId) || userMemory.aiEnabled === false) {
      console.log(`⏸️ User ${userMemory.username} (${senderId}) is in the EXCLUDE list. Skipping auto-reply.`);
      return;
    }
  } else if (config.chatMode === 'only_selected') {
    if (!(config.includedContactIds || []).includes(senderId)) {
      console.log(`⏸️ User ${userMemory.username} (${senderId}) is NOT in the selected whitelist. Skipping auto-reply.`);
      return;
    }
  }

  // Check if AI is enabled for this specific user
  if (!userMemory.aiEnabled) {
    console.log(`⏸️ AI is paused for user ${userMemory.username} (${senderId}). Skipping auto-reply.`);
    return;
  }

  // Check per-person custom reply toggles:
  if (isReelOrShare && userMemory.replyToReelsAndPosts === false) {
    console.log(`⏸️ Reel & Post auto-reply disabled for user @${userMemory.username} (${senderId}). Skipping reply.`);
    return;
  }

  if (!isReelOrShare && userMemory.replyToMessages === false) {
    console.log(`⏸️ Text message auto-reply disabled for user @${userMemory.username} (${senderId}). Skipping reply.`);
    return;
  }

  // 5. If user shared a Reel/Post or media, react with an emoji first!
  if (isReelOrShare && mid && mid !== 'random_mid') {
    instagramService.sendMessageReaction(senderId, mid, '😂').catch(() => {});
  }

  // 6. Anti-Spam / Debounce Logic:
  // If the user is rapid-firing messages or spamming, hold on until they stop typing!
  // This aggregates their messages, saves tokens, and replies once naturally like a human.
  if (userDebounceQueues.has(senderId)) {
    const existing = userDebounceQueues.get(senderId);
    clearTimeout(existing.timer);
    existing.messages.push({ text: messageText, mid });
    existing.lastMid = mid;
    existing.isReelOrShare = existing.isReelOrShare || isReelOrShare;

    console.log(`⏳ [Anti-Spam / Debounce]: User ${senderId} sent another message (${existing.messages.length} queued). Holding on for ${DEBOUNCE_WAIT_MS / 1000}s...`);

    existing.timer = setTimeout(() => {
      userDebounceQueues.delete(senderId);
      dispatchDebouncedReply(existing).catch(err => {
        console.error('❌ Error dispatching debounced reply:', err);
      });
    }, DEBOUNCE_WAIT_MS);
    return;
  }

  // First message in a potential cluster: start debounce window
  const queueEntry = {
    senderId,
    recipientId,
    userMemory,
    config,
    messages: [{ text: messageText, mid }],
    lastMid: mid,
    isReelOrShare,
    timer: null,
  };

  userDebounceQueues.set(senderId, queueEntry);
  queueEntry.timer = setTimeout(() => {
    userDebounceQueues.delete(senderId);
    dispatchDebouncedReply(queueEntry).catch(err => {
      console.error('❌ Error dispatching debounced reply:', err);
    });
  }, DEBOUNCE_WAIT_MS);
}

/**
 * Dispatches a single, smart AI reply after user finishes typing their message(s)
 */
async function dispatchDebouncedReply(queueEntry) {
  const { senderId, recipientId, userMemory, config, messages, lastMid } = queueEntry;

  // Combine multiple messages if user sent a cluster
  const combinedText = messages.map(m => m.text).join('\n');
  if (messages.length > 1) {
    console.log(`🧠 [Anti-Spam Batching]: Aggregated ${messages.length} messages from ${senderId}:\n"${combinedText}"`);
  }

  // Send typing indicator to Instagram
  await instagramService.sendSenderAction(senderId, 'mark_seen');
  await instagramService.sendSenderAction(senderId, 'typing_on');

  // Realistic typing delay
  const delayMs = (config.typingDelaySeconds || 1.5) * 1000;
  await new Promise(resolve => setTimeout(resolve, delayMs));

  // Fetch recent conversation history
  const history = await Message.find({
    $or: [
      { senderId, recipientId },
      { senderId: recipientId, recipientId: senderId }
    ]
  })
  .sort({ createdAt: -1 })
  .limit(10);

  history.reverse();

  // Generate response mimicking Sam Joshua
  console.log(`🤖 Generating Sam's response via Azure OpenAI...`);
  let replyText = await azureOpenAI.generateReply({
    userMemory,
    messageHistory: history,
    incomingText: combinedText,
  });

  // Extract optional sticker tag
  const stickerMatch = replyText.match(/\[STICKER:\s*([a-zA-Z0-9_-]+)\]/i);
  let stickerType = null;
  if (stickerMatch) {
    stickerType = stickerMatch[1].toLowerCase();
    replyText = replyText.replace(/\[STICKER:\s*[a-zA-Z0-9_-]+\]/gi, '').trim();
  }

  console.log(`✨ [Sam's AI Reply]: "${replyText}" ${stickerType ? `[Sticker: ${stickerType}]` : ''}`);

  // Send reply via Instagram Graph API (swipe-to-reply quoting the last message in the batch)
  let sendResult = null;
  if (replyText && replyText.trim().length > 0) {
    sendResult = await instagramService.sendTextMessage(senderId, replyText, null, lastMid);
  }

  // If a sticker was chosen, send the sticker image directly to Instagram DM!
  if (stickerType && stickerService.hasSticker(stickerType)) {
    const stickerUrl = stickerService.getStickerUrl(stickerType);
    if (stickerUrl) {
      const delay = (replyText && replyText.trim().length > 0) ? 600 : 0;
      setTimeout(async () => {
        try {
          console.log(`🖼️ [Sticker Dispatch]: Sending ${stickerType} sticker (${stickerUrl}) to ${senderId}...`);
          await instagramService.sendImageMessage(senderId, stickerUrl);
        } catch (e) {
          console.error(`❌ [Sticker Error]: Failed to send sticker:`, e.message);
        }
      }, delay);
    }
  }

  // Save outgoing message in DB
  await Message.create({
    senderId: recipientId,
    recipientId: senderId,
    role: 'assistant',
    text: replyText || (stickerType ? `[Sent ${stickerType} sticker]` : ''),
    mid: sendResult?.data?.message_id || `out_${Date.now()}`,
    sentByAI: true,
    timestamp: new Date(),
  });

  // Turn off typing
  await instagramService.sendSenderAction(senderId, 'typing_off');

  // Update memory, extracted facts, and summary in background
  memoryService.updateMemoryAsync(senderId).catch(err => {
    console.error('Failed to update memory in background:', err.message);
  });
}

/**
 * ---------------------------------------------------------------------
 * 2. DASHBOARD & MANAGEMENT API ENDPOINTS
 * ---------------------------------------------------------------------
 */

// Status check endpoint
app.get('/api/status', async (req, res) => {
  try {
    const config = await PersonaConfig.findOne() || {};
    const totalUsers = await UserMemory.countDocuments();
    const totalMessages = await Message.countDocuments();
    const token = await instagramService.getAccessToken();

    res.json({
      status: 'online',
      creatorName: config.creatorName || 'Sam Joshua',
      instagramHandle: config.instagramHandle || '@chipichappa.daily',
      globalBotActive: config.globalBotActive ?? true,
      chatMode: config.chatMode || 'everyone',
      excludedContactIds: config.excludedContactIds || [],
      includedContactIds: config.includedContactIds || [],
      hasPageAccessToken: !!(token && token.length > 10),
      appId: process.env.META_APP_ID || '1037131122693653',
      webhookVerifyToken: VERIFY_TOKEN,
      totalUsers,
      totalMessages,
      azureModel: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all conversations
app.get('/api/conversations', async (req, res) => {
  try {
    const users = await UserMemory.find().sort({ lastInteraction: -1 }).limit(50);
    const conversations = [];

    for (const u of users) {
      const lastMessage = await Message.findOne({
        $or: [{ senderId: u.senderId }, { recipientId: u.senderId }]
      }).sort({ createdAt: -1 });

      conversations.push({
        user: u,
        lastMessage: lastMessage ? {
          text: lastMessage.text,
          role: lastMessage.role,
          timestamp: lastMessage.timestamp || lastMessage.createdAt,
        } : null,
      });
    }

    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages for a specific conversation
app.get('/api/conversations/:senderId/messages', async (req, res) => {
  try {
    const { senderId } = req.params;
    const memory = await UserMemory.findOne({ senderId });
    const messages = await Message.find({
      $or: [{ senderId }, { recipientId: senderId }]
    }).sort({ createdAt: 1 }).limit(100);

    res.json({ memory, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle AI for a specific user
app.post('/api/conversations/:senderId/toggle-ai', async (req, res) => {
  try {
    const { senderId } = req.params;
    const memory = await UserMemory.findOne({ senderId });
    if (!memory) return res.status(404).json({ error: 'User not found' });

    memory.aiEnabled = !memory.aiEnabled;
    await memory.save();

    res.json({ success: true, aiEnabled: memory.aiEnabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manually send message as Sam from the dashboard
app.post('/api/conversations/:senderId/send', async (req, res) => {
  try {
    const { senderId } = req.params;
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text required' });

    // Send via Instagram
    const sendResult = await instagramService.sendTextMessage(senderId, text);

    // Save in DB
    const newMsg = await Message.create({
      senderId: 'me',
      recipientId: senderId,
      role: 'assistant',
      text,
      mid: sendResult?.data?.message_id || `manual_${Date.now()}`,
      sentByAI: false,
      timestamp: new Date(),
    });

    // Cancel any active AI debounce queue so the bot doesn't reply over the creator
    if (userDebounceQueues.has(senderId)) {
      clearTimeout(userDebounceQueues.get(senderId).timer);
      userDebounceQueues.delete(senderId);
    }

    // Update memory interaction time & reset reminder cycle to reactivate conversation
    await UserMemory.updateOne({ senderId }, { 
      lastInteraction: new Date(),
      lastReminderSentAt: null,
      $inc: { messageCount: 1 }
    });

    res.json({ success: true, message: newMsg, graphResult: sendResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update custom per-person AI reply toggles and preferences
app.post('/api/conversations/:senderId/preferences', async (req, res) => {
  try {
    const { senderId } = req.params;
    const { 
      aiEnabled, 
      replyToMessages, 
      replyToReelsAndPosts, 
      remindersEnabled, 
      nickname, 
      gender, 
      personalNotes,
      conversationStyle,
      relationshipType
    } = req.body;

    const memory = await UserMemory.findOne({ senderId });
    if (!memory) return res.status(404).json({ error: 'User not found' });

    if (typeof aiEnabled === 'boolean') memory.aiEnabled = aiEnabled;
    if (typeof replyToMessages === 'boolean') memory.replyToMessages = replyToMessages;
    if (typeof replyToReelsAndPosts === 'boolean') memory.replyToReelsAndPosts = replyToReelsAndPosts;
    if (typeof remindersEnabled === 'boolean') memory.remindersEnabled = remindersEnabled;
    if (typeof nickname === 'string') memory.nickname = nickname.trim();
    if (typeof gender === 'string') memory.gender = gender;
    if (typeof personalNotes === 'string') memory.personalNotes = personalNotes;
    if (typeof conversationStyle === 'string') memory.conversationStyle = conversationStyle;
    if (typeof relationshipType === 'string') memory.relationshipType = relationshipType;

    await memory.save();

    res.json({ success: true, memory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user memory facts or style manually
app.put('/api/conversations/:senderId/memory', async (req, res) => {
  try {
    const { senderId } = req.params;
    const { conversationStyle, relationshipType, facts, rollingSummary } = req.body;

    const memory = await UserMemory.findOne({ senderId });
    if (!memory) return res.status(404).json({ error: 'User not found' });

    if (conversationStyle) memory.conversationStyle = conversationStyle;
    if (relationshipType) memory.relationshipType = relationshipType;
    if (rollingSummary) memory.rollingSummary = rollingSummary;
    if (Array.isArray(facts)) {
      memory.facts = facts.map(f => typeof f === 'string' ? { fact: f } : f);
    }

    await memory.save();
    res.json({ success: true, memory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Force AI to analyze conversation history and learn/synthesize memory
app.post('/api/conversations/:senderId/learn', async (req, res) => {
  try {
    const { senderId } = req.params;
    await memoryService.updateMemoryAsync(senderId);
    const updatedMemory = await UserMemory.findOne({ senderId });
    res.json({ success: true, memory: updatedMemory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add custom fact/memory
app.post('/api/conversations/:senderId/fact', async (req, res) => {
  try {
    const { senderId } = req.params;
    const { fact } = req.body;
    if (!fact) return res.status(400).json({ error: 'Fact is required' });

    const memory = await UserMemory.findOne({ senderId });
    if (!memory) return res.status(404).json({ error: 'User not found' });

    memory.facts.push({ fact: fact.trim() });
    await memory.save();
    res.json({ success: true, memory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Persona Configuration
app.get('/api/persona', async (req, res) => {
  try {
    let config = await PersonaConfig.findOne();
    if (!config) {
      config = await PersonaConfig.create({});
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Persona Configuration
app.put('/api/persona', async (req, res) => {
  try {
    let config = await PersonaConfig.findOne();
    if (!config) {
      config = new PersonaConfig();
    }

    const {
      creatorName,
      instagramHandle,
      personaBio,
      toneGuidelines,
      sampleConversations,
      customKnowledge,
      forbiddenWords,
      globalBotActive,
      chatMode,
      excludedContactIds,
      includedContactIds,
      typingDelaySeconds,
      instagramPageAccessToken,
      instagramAccountId,
    } = req.body;

    if (creatorName !== undefined) config.creatorName = creatorName;
    if (instagramHandle !== undefined) config.instagramHandle = instagramHandle;
    if (personaBio !== undefined) config.personaBio = personaBio;
    if (toneGuidelines !== undefined) config.toneGuidelines = toneGuidelines;
    if (sampleConversations !== undefined) config.sampleConversations = sampleConversations;
    if (customKnowledge !== undefined) config.customKnowledge = customKnowledge;
    if (forbiddenWords !== undefined) config.forbiddenWords = forbiddenWords;
    if (globalBotActive !== undefined) config.globalBotActive = globalBotActive;
    if (chatMode !== undefined) config.chatMode = chatMode;
    if (excludedContactIds !== undefined) config.excludedContactIds = excludedContactIds;
    if (includedContactIds !== undefined) config.includedContactIds = includedContactIds;
    if (typingDelaySeconds !== undefined) config.typingDelaySeconds = typingDelaySeconds;
    if (instagramPageAccessToken !== undefined) config.instagramPageAccessToken = instagramPageAccessToken;
    if (instagramAccountId !== undefined) config.instagramAccountId = instagramAccountId;

    await config.save();
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Interactive Simulator: lets Sam test his AI clone without needing live Instagram DMs first!
app.post('/api/simulator/chat', async (req, res) => {
  try {
    const { testSenderId = 'test_fan_01', testUsername = 'alex_design', messageText } = req.body;
    if (!messageText) return res.status(400).json({ error: 'messageText is required' });

    // 1. Get or create memory for test user
    const userMemory = await memoryService.getOrCreateUserMemory(testSenderId, {
      username: testUsername,
      name: testUsername,
    });

    // 2. Save user message
    await Message.create({
      senderId: testSenderId,
      recipientId: 'me',
      role: 'user',
      text: messageText,
      timestamp: new Date(),
    });

    // 3. Get recent history
    const history = await Message.find({
      $or: [
        { senderId: testSenderId },
        { recipientId: testSenderId }
      ]
    }).sort({ createdAt: -1 }).limit(10);
    history.reverse();

    // 4. Generate AI response
    const replyText = await azureOpenAI.generateReply({
      userMemory,
      messageHistory: history,
      incomingText: messageText,
    });

    // 5. Save assistant reply
    await Message.create({
      senderId: 'me',
      recipientId: testSenderId,
      role: 'assistant',
      text: replyText,
      sentByAI: true,
      timestamp: new Date(),
    });

    // 6. Asynchronously update memory
    await memoryService.updateMemoryAsync(testSenderId);
    const updatedMemory = await UserMemory.findOne({ senderId: testSenderId });

    res.json({
      replyText,
      userMemory: updatedMemory,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test Instagram Token Validity
app.post('/api/test-token', async (req, res) => {
  try {
    const token = req.body.token || await instagramService.getAccessToken();
    if (!token) return res.status(400).json({ error: 'No token provided or configured.' });

    const axios = require('axios');
    const response = await axios.get('https://graph.facebook.com/v21.0/me', {
      params: {
        fields: 'id,name,accounts',
        access_token: token,
      }
    });

    res.json({ success: true, data: response.data });
  } catch (err) {
    const errData = err.response ? err.response.data : err.message;
    res.status(400).json({ success: false, error: errData });
  }
});

// Health check & status fallback
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Privacy Policy for Meta App Review & Live Mode
app.get('/privacy', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Privacy Policy - Chatter AI</title></head>
    <body style="font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6;">
      <h1>Privacy Policy for Chatter AI</h1>
      <p>Last updated: September 2026</p>
      <p>Chatter AI provides automated direct messaging capabilities for Instagram Creator accounts.</p>
      <h2>Data We Process</h2>
      <p>We receive incoming message text, sender IDs, and timestamps strictly to generate contextual conversational replies via AI.</p>
      <h2>Data Retention & Deletion</h2>
      <p>Conversations are stored securely to maintain user memory and can be deleted at any time upon request.</p>
      <p>Contact: support@chatter.ai</p>
    </body>
    </html>
  `);
});

// User Data Deletion Callback for Meta
app.all('/data-deletion', (req, res) => {
  res.json({
    url: 'https://page-pool-recorded-father.trycloudflare.com/privacy',
    confirmation_code: 'chatter_deletion_success'
  });
});


// Endpoint to manually trigger 3-day message cleanup and view freed space
app.post('/api/cleanup', async (req, res) => {
  try {
    const days = parseInt(req.body.days) || 3;
    const deletedCount = await memoryService.cleanOldMessages(days);
    res.json({ success: true, deletedCount, message: `Deleted ${deletedCount} messages older than ${days} days` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Social Graph Tree Chain Endpoints (auto-discovers newly talked contacts & enriches with live DP & per-person AI settings)
app.get('/api/social-graph', async (req, res) => {
  try {
    // 1. Train and link graph from DB first so newly talked people appear immediately
    await socialGraphService.trainGraphFromDB(UserMemory, Message);

    // 2. Fetch all social graph nodes
    const nodes = await SocialGraph.find({}).sort({ updatedAt: -1 });

    // 3. Attach UserMemory settings (aiEnabled, replyToMessages, replyToReelsAndPosts, profilePic, messageCount) to each node
    const enrichedNodes = await Promise.all(nodes.map(async (n) => {
      let memory = null;
      if (n.senderId) {
        memory = await UserMemory.findOne({ senderId: n.senderId });
      }
      if (!memory && n.instagramHandle) {
        const cleanU = n.instagramHandle.replace(/^@/, '').toLowerCase().trim();
        memory = await UserMemory.findOne({ username: new RegExp(`^${escapeRegex(cleanU)}$`, 'i') });
      }

      return {
        ...n.toObject(),
        profilePic: memory?.profilePic || n.profilePic || '',
        aiEnabled: memory ? memory.aiEnabled !== false : true,
        replyToMessages: memory ? memory.replyToMessages !== false : true,
        replyToReelsAndPosts: memory ? memory.replyToReelsAndPosts !== false : true,
        messageCount: memory?.messageCount || 0,
        lastInteraction: memory?.lastInteraction || n.updatedAt
      };
    }));

    res.json({ success: true, nodes: enrichedNodes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/social-graph/sync', async (req, res) => {
  try {
    await socialGraphService.seedInitialGraph();
    await socialGraphService.trainGraphFromDB(UserMemory, Message);
    const nodes = await SocialGraph.find({});
    res.json({ success: true, message: 'Social knowledge tree synced from DB', count: nodes.length, nodes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add or edit a friend node in the social knowledge tree
app.post('/api/social-graph/node', async (req, res) => {
  try {
    const finalRelationship = relationshipToSam || req.body.relationship || 'friend';
    const rawHandle = instagramHandle || req.body.handle || '';
    const finalHandle = rawHandle ? (rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`) : '';

    let parsedAliases = [];
    if (Array.isArray(aliases)) {
      parsedAliases = aliases;
    } else if (typeof aliases === 'string') {
      parsedAliases = aliases.split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
    }

    let parsedLore = [];
    if (Array.isArray(lore)) {
      parsedLore = lore;
    } else if (typeof lore === 'string') {
      parsedLore = lore.split('\n').map(l => l.trim().replace(/^[•\-\*]\s*/, '')).filter(Boolean);
    }

    let parsedConnections = [];
    if (Array.isArray(connections)) {
      parsedConnections = connections.map(c => {
        if (typeof c === 'string') {
          return { targetName: c.trim(), relationship: 'connected', notes: '' };
        }
        return {
          targetName: c.targetName || c.name || '',
          relationship: c.relationship || c.rel || 'friend',
          notes: c.notes || ''
        };
      }).filter(c => c.targetName);
    } else if (typeof connections === 'string') {
      parsedConnections = connections.split(',').map(c => {
        const match = c.trim().match(/^([^(]+)(?:\(([^)]+)\))?/);
        if (match) {
          return {
            targetName: match[1].trim(),
            relationship: (match[2] || 'friend').trim(),
            notes: ''
          };
        }
        return null;
      }).filter(Boolean);
    }

    const updated = await SocialGraph.findOneAndUpdate(
      { name: new RegExp(`^${name.trim()}$`, 'i') },
      {
        $set: {
          name: name.trim(),
          aliases: parsedAliases,
          instagramHandle: finalHandle,
          senderId: senderId || '',
          gender: gender || 'unknown',
          relationshipToSam: finalRelationship,
          lore: parsedLore,
          roastStyle: roastStyle || 'Banter back naturally matching their energy.',
          connections: parsedConnections,
          updatedAt: new Date()
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    if (senderId) {
      await UserMemory.findOneAndUpdate(
        { senderId },
        { $set: { name: name.trim(), nickname: name.trim() } }
      );
    }

    socialGraphService.clearCache();
    res.json({ success: true, node: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Link an Instagram ID / handle to an existing friend node and merge records
app.post('/api/social-graph/link-id', async (req, res) => {
  try {
    const { personName, instagramHandle, senderId } = req.body;
    if (!personName) return res.status(400).json({ error: 'Person name is required' });

    const cleanName = personName.trim();
    const cleanHandle = instagramHandle ? `@${instagramHandle.replace(/^@/, '').trim()}` : '';
    const cleanUsername = cleanHandle ? cleanHandle.replace(/^@/, '').toLowerCase() : '';

    // 1. Find the target SocialGraph node
    let node = await SocialGraph.findOne({
      $or: [
        { name: new RegExp(`^${escapeRegex(cleanName)}$`, 'i') },
        { aliases: cleanName.toLowerCase() }
      ]
    });

    if (!node) {
      return res.status(404).json({ error: `Person "${cleanName}" not found in Social Knowledge Tree.` });
    }

    // 2. Check if a UserMemory exists with this senderId or username
    let memory = null;
    if (senderId) {
      memory = await UserMemory.findOne({ senderId });
    }
    if (!memory && cleanUsername) {
      memory = await UserMemory.findOne({ username: new RegExp(`^${escapeRegex(cleanUsername)}$`, 'i') });
    }

    // 3. Check if there was another node created automatically from UserMemory for this handle/senderId that should be merged
    const otherNode = await SocialGraph.findOne({
      _id: { $ne: node._id },
      $or: [
        ...(senderId ? [{ senderId }] : []),
        ...(cleanHandle ? [{ instagramHandle: cleanHandle }] : []),
        ...(cleanUsername ? [{ aliases: cleanUsername }] : [])
      ]
    });

    if (otherNode) {
      console.log(`🔗 [Merge Nodes]: Merging node "${otherNode.name}" into "${node.name}"`);
      // Combine lore
      const combinedLore = new Set([...(node.lore || []), ...(otherNode.lore || [])]);
      node.lore = Array.from(combinedLore);

      // Combine aliases
      const combinedAliases = new Set([...(node.aliases || []), ...(otherNode.aliases || []), cleanUsername]);
      node.aliases = Array.from(combinedAliases);

      // Combine connections
      const targetSet = new Set((node.connections || []).map(c => c.targetName.toLowerCase()));
      (otherNode.connections || []).forEach(c => {
        if (!targetSet.has(c.targetName.toLowerCase())) {
          node.connections.push(c);
          targetSet.add(c.targetName.toLowerCase());
        }
      });

      // Delete the duplicate auto-discovered node
      await SocialGraph.deleteOne({ _id: otherNode._id });
    }

    // 4. Update the canonical node with handle, senderId, profilePic
    if (cleanHandle) node.instagramHandle = cleanHandle;
    if (senderId || memory?.senderId) node.senderId = senderId || memory?.senderId;
    if (memory?.profilePic && !node.profilePic) node.profilePic = memory.profilePic;

    if (cleanUsername && !node.aliases.includes(cleanUsername)) {
      node.aliases.push(cleanUsername);
    }
    node.updatedAt = new Date();
    await node.save();

    // 5. Update or link UserMemory so AI recognizes them in live DMs
    if (memory) {
      memory.nickname = node.name;
      if (!memory.name || memory.name.startsWith('User_')) memory.name = node.name;
      await memory.save();
    } else if (cleanUsername && node.senderId) {
      await UserMemory.findOneAndUpdate(
        { senderId: node.senderId },
        {
          $set: {
            username: cleanUsername,
            name: node.name,
            nickname: node.name
          }
        },
        { upsert: true }
      );
    }

    socialGraphService.clearCache();
    console.log(`✅ [Link ID Success]: Linked ${node.name} to ${cleanHandle} (senderId: ${node.senderId})`);

    res.json({
      success: true,
      message: `Linked ${node.name} with ${cleanHandle || node.senderId}`,
      node
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get recent chatters from UserMemory to suggest when linking handles
app.get('/api/social-graph/unlinked-chatters', async (req, res) => {
  try {
    const memories = await UserMemory.find({
      username: { $not: /^(test_|ig_tester_|catovidz$|me$|user_\d+)/i },
      senderId: { $ne: 'me' }
    }).sort({ lastInteraction: -1 }).limit(30);

    const chatters = memories.map(m => ({
      senderId: m.senderId,
      username: m.username ? `@${m.username.replace(/^@/, '')}` : '',
      name: m.name || m.nickname || m.username,
      profilePic: m.profilePic || '',
      lastInteraction: m.lastInteraction
    }));

    res.json({ success: true, chatters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a friend node from the tree and database
app.delete('/api/social-graph/node/:name', async (req, res) => {
  try {
    const rawName = (req.params.name || '').trim();
    if (!rawName) return res.status(400).json({ error: 'Name is required' });

    await SocialGraph.deleteMany({
      $or: [
        { name: new RegExp(`^${escapeRegex(rawName)}$`, 'i') },
        { name: rawName },
        { instagramHandle: `@${rawName.replace(/^@/, '')}` }
      ]
    });
    socialGraphService.clearCache();
    res.json({ success: true, message: `Deleted ${rawName} from database` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update per-person AI reply policy (Full AI, Only Reels, Stop AI / Sam Manual)
app.post('/api/social-graph/node/:identifier/preferences', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { aiMode, aiEnabled, replyToMessages, replyToReelsAndPosts } = req.body;

    let finalAiEnabled = aiEnabled;
    let finalReplyMessages = replyToMessages;
    let finalReplyReels = replyToReelsAndPosts;

    if (aiMode === 'full_ai') {
      finalAiEnabled = true;
      finalReplyMessages = true;
      finalReplyReels = true;
    } else if (aiMode === 'reels_only') {
      finalAiEnabled = true;
      finalReplyMessages = false;
      finalReplyReels = true;
    } else if (aiMode === 'messages_only') {
      finalAiEnabled = true;
      finalReplyMessages = true;
      finalReplyReels = false;
    } else if (aiMode === 'paused' || aiMode === 'manual') {
      finalAiEnabled = false;
      finalReplyMessages = false;
      finalReplyReels = false;
    }

    const cleanId = (identifier || '').trim();
    const cleanHandle = cleanId.replace(/^@/, '');

    // Update UserMemory if present
    await UserMemory.updateMany(
      {
        $or: [
          { senderId: cleanId },
          { username: new RegExp(`^${escapeRegex(cleanHandle)}$`, 'i') },
          { name: new RegExp(`^${escapeRegex(cleanId)}$`, 'i') }
        ]
      },
      {
        $set: {
          ...(typeof finalAiEnabled === 'boolean' ? { aiEnabled: finalAiEnabled } : {}),
          ...(typeof finalReplyMessages === 'boolean' ? { replyToMessages: finalReplyMessages } : {}),
          ...(typeof finalReplyReels === 'boolean' ? { replyToReelsAndPosts: finalReplyReels } : {})
        }
      }
    );

    // Update SocialGraph if present
    await SocialGraph.updateMany(
      {
        $or: [
          { senderId: cleanId },
          { instagramHandle: new RegExp(`^@?${escapeRegex(cleanHandle)}$`, 'i') },
          { name: new RegExp(`^${escapeRegex(cleanId)}$`, 'i') },
          { aliases: cleanHandle.toLowerCase() }
        ]
      },
      {
        $set: {
          ...(typeof finalAiEnabled === 'boolean' ? { aiEnabled: finalAiEnabled } : {}),
          ...(typeof finalReplyMessages === 'boolean' ? { replyToMessages: finalReplyMessages } : {}),
          ...(typeof finalReplyReels === 'boolean' ? { replyToReelsAndPosts: finalReplyReels } : {})
        }
      }
    );

    socialGraphService.clearCache();
    res.json({
      success: true,
      preferences: {
        aiEnabled: finalAiEnabled,
        replyToMessages: finalReplyMessages,
        replyToReelsAndPosts: finalReplyReels
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI Conversational Interview to clarify friend details, relationships & lore
app.post('/api/social-graph/ai-interview', async (req, res) => {
  try {
    const { conversationHistory, userInput, existingNode, autoSave } = req.body;
    const interviewResult = await azureOpenAI.interviewPersonForSocialTree({
      conversationHistory,
      userInput,
      existingNode
    });

    // Handle automated duplicate merging in DB
    if (Array.isArray(interviewResult.duplicateNamesToDelete) && interviewResult.duplicateNamesToDelete.length > 0) {
      console.log('🗑️ AI identified duplicate names to remove from DB:', interviewResult.duplicateNamesToDelete);
      const queryList = interviewResult.duplicateNamesToDelete.map(n => n.trim()).filter(Boolean);
      const regexList = queryList.map(n => new RegExp(`^${escapeRegex(n)}$`, 'i'));

      await SocialGraph.deleteMany({
        $or: [
          { name: { $in: regexList } },
          { name: { $in: queryList } }
        ]
      });
      socialGraphService.clearCache();
    }

    if (interviewResult.isComplete && (autoSave || interviewResult.duplicateNamesToDelete?.length) && interviewResult.node?.name) {
      const node = interviewResult.node;
      await SocialGraph.findOneAndUpdate(
        { name: new RegExp(`^${node.name.trim()}$`, 'i') },
        {
          $set: {
            name: node.name.trim(),
            aliases: node.aliases || [],
            instagramHandle: node.instagramHandle || '',
            gender: node.gender || 'unknown',
            relationshipToSam: node.relationshipToSam || 'friend',
            lore: node.lore || [],
            roastStyle: node.roastStyle || '',
            connections: node.connections || [],
            updatedAt: new Date()
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
      socialGraphService.clearCache();
    }

    res.json({ success: true, ...interviewResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Instagram AI Automation Server Running!`);
  console.log(`🌐 Dashboard: http://localhost:${PORT}`);
  console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`🔑 Webhook Verify Token: ${VERIFY_TOKEN}`);
  console.log(`======================================================\n`);

  // Seed & train social knowledge tree
  socialGraphService.seedInitialGraph().then(() => {
    return socialGraphService.trainGraphFromDB(UserMemory, Message);
  }).catch(e => console.error('❌ SocialGraph init error:', e.message));

  // Start 5-6 hr follow-up reminder scheduler
  reminderService.startScheduler(15);

  // Start automatic 3-day old chat cleanup scheduler to conserve DB storage
  memoryService.startDailyCleanup(3);
});
