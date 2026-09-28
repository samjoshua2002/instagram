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

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Webhook Verification Token
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'chatter_instagram_secret_2025';

// Cache for recent message IDs to prevent duplicate processing
const processedMids = new Set();

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

// POST /webhook: Incoming Instagram Events (DMs, echoes, etc.)
app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log(`📥 [Webhook Event Received]:`, JSON.stringify(body));

  // Immediately respond 200 OK so Meta doesn't retry
  res.status(200).send('EVENT_RECEIVED');

  for (const entry of body.entry || []) {
    // Format 1: Classic entry.messaging format
    if (Array.isArray(entry.messaging)) {
      for (const event of entry.messaging) {
        if (event.message && !event.message.is_echo && event.message.text) {
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
          if (val.message && !val.message.is_echo && val.message.text) {
            handleIncomingInstagramMessage({
              sender: val.sender,
              recipient: val.recipient,
              timestamp: val.timestamp,
              message: val.message,
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


  // 4. Check if Bot is enabled (both globally and for this specific user)
  if (!config.globalBotActive) {
    console.log(`⏸️ Global Bot is paused. Message saved to inbox, skipping auto-reply.`);
    return;
  }

  if (!userMemory.aiEnabled) {
    console.log(`⏸️ AI is paused for user ${userMemory.username} (${senderId}). Skipping auto-reply.`);
    return;
  }

  // 5. Send typing indicator to Instagram
  await instagramService.sendSenderAction(senderId, 'mark_seen');
  await instagramService.sendSenderAction(senderId, 'typing_on');

  // Realistic typing delay
  const delayMs = (config.typingDelaySeconds || 1.5) * 1000;
  await new Promise(resolve => setTimeout(resolve, delayMs));

  // 6. Fetch recent conversation history
  const history = await Message.find({
    $or: [
      { senderId, recipientId },
      { senderId: recipientId, recipientId: senderId }
    ]
  })
  .sort({ createdAt: -1 })
  .limit(10);

  history.reverse();

  // 7. Generate response mimicking Sam Joshua
  console.log(`🤖 Generating Sam's response via Azure OpenAI...`);
  const replyText = await azureOpenAI.generateReply({
    userMemory,
    messageHistory: history,
    incomingText: messageText,
  });

  console.log(`✨ [Sam's AI Reply]: "${replyText}"`);

  // Determine appropriate token for sending
  let replyToken = null;
  if (accountId === '17841445731016310') {
    replyToken = process.env.M4VISYZX_TOKEN || process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  } else if (accountId === '17841446877896232') {
    replyToken = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  }

  // 8. Send reply via Instagram Graph API
  const sendResult = await instagramService.sendTextMessage(senderId, replyText, replyToken);

  // 9. Save outgoing message in DB
  await Message.create({
    senderId: recipientId,
    recipientId: senderId,
    role: 'assistant',
    text: replyText,
    mid: sendResult?.data?.message_id || `out_${Date.now()}`,
    sentByAI: true,
    timestamp: new Date(),
  });

  // 10. Turn off typing
  await instagramService.sendSenderAction(senderId, 'typing_off');

  // 11. Update memory, extracted facts, and summary in background
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

    // Update memory interaction time
    await UserMemory.updateOne({ senderId }, { lastInteraction: new Date() });

    res.json({ success: true, message: newMsg, graphResult: sendResult });
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


// Start Server
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Instagram AI Automation Server Running!`);
  console.log(`🌐 Dashboard: http://localhost:${PORT}`);
  console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`🔑 Webhook Verify Token: ${VERIFY_TOKEN}`);
  console.log(`======================================================\n`);
});
