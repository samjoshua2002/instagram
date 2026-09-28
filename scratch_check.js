require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('./models/Message');
const PersonaConfig = require('./models/PersonaConfig');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const msgs = await Message.find().sort({ createdAt: -1 }).limit(6);
  console.log('--- RECENT MESSAGES ---');
  msgs.forEach(m => {
    console.log(`[${m.role}] From: ${m.senderId} -> To: ${m.recipientId} | mid: ${m.mid} | Text: "${m.text.substring(0, 40)}"`);
  });
  
  const config = await PersonaConfig.findOne();
  console.log('--- PERSONA CONFIG ---');
  console.log({
    globalBotActive: config?.globalBotActive,
    hasDbToken: !!config?.instagramPageAccessToken,
    dbAccountId: config?.instagramAccountId,
    envAccountId: process.env.INSTAGRAM_ACCOUNT_ID
  });
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
