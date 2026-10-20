require('dotenv').config();
const connectDB = require('../config/db');
const memoryService = require('../services/memoryService');
const redisService = require('../services/redisService');
const Message = require('../models/Message');
const UserMemory = require('../models/UserMemory');

async function run() {
  console.log('🚀 Connecting to MongoDB...');
  await connectDB();

  console.log('📊 Fetching message stats from MongoDB...');
  const totalMessages = await Message.countDocuments();
  const totalUsers = await UserMemory.countDocuments();
  console.log(`📈 Total historical messages: ${totalMessages}`);
  console.log(`👥 Total user memories: ${totalUsers}`);

  console.log('\n🧠 Starting deep memory synthesis for all contacts across past 1-month chat data...');
  const results = await memoryService.batchSyncAllChatsFromMongo();

  console.log('\n================ SUMMARY ================');
  console.log(`✅ Successfully synthesized and learned memory for ${results.length} contacts!`);
  for (const r of results) {
    console.log(`- @${r.username || r.senderId} (${r.name || 'Unnamed'}):`);
    console.log(`  • Messages: ${r.messageCount || 0} | Facts: ${r.factsCount} | Dates: ${r.datesCount} | Real Few-Shot Samples: ${r.exchangesCount}`);
    if (r.style) console.log(`  • User Style: "${r.style.slice(0, 60)}"`);
    if (r.samSpeakingStyle) console.log(`  • Sam Speaking Style: "${r.samSpeakingStyle.slice(0, 60)}"`);
    if (r.roastStyle) console.log(`  • Banter/Roast: "${r.roastStyle.slice(0, 60)}"`);
  }
  console.log('=========================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Batch sync failed:', err);
  process.exit(1);
});
