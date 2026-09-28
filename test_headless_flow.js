require('dotenv').config();
const connectDB = require('./config/db');
const UserMemory = require('./models/UserMemory');
const Message = require('./models/Message');
const PersonaConfig = require('./models/PersonaConfig');
const azureOpenAI = require('./services/azureOpenAI');
const memoryService = require('./services/memoryService');

async function testHeadlessDM() {
  console.log("🚀 Testing 100% Headless Instagram DM Automation Pipeline...\n");

  await connectDB();

  // 1. Simulate an incoming DM from a user: "catovidz" (from the screenshot!)
  const testSenderId = "ig_tester_catovidz_12345";
  const incomingUserMessage = "Yo Sam! Loved your new video reel! I am a motion designer based in Toronto. Do you use Premiere or Davinci?";

  console.log(`📩 [Simulated Instagram Webhook Inflow]`);
  console.log(`From: catovidz (${testSenderId})`);
  console.log(`Message: "${incomingUserMessage}"\n`);

  // 2. Fetch or initialize UserMemory
  let userMemory = await memoryService.getOrCreateUserMemory(testSenderId, {
    username: "catovidz",
    name: "Cato Vidz",
  });
  console.log(`🧠 Existing User Memory:`, {
    style: userMemory.conversationStyle,
    relationship: userMemory.relationshipType,
    facts: userMemory.facts.map(f => f.fact),
    summary: userMemory.rollingSummary
  });

  // 3. Save incoming user message in MongoDB
  await Message.create({
    senderId: testSenderId,
    recipientId: "chipichappa.daily",
    role: "user",
    text: incomingUserMessage,
    mid: `test_mid_${Date.now()}`,
    timestamp: new Date()
  });

  // 4. Retrieve recent message history
  const history = await Message.find({
    $or: [
      { senderId: testSenderId },
      { recipientId: testSenderId }
    ]
  }).sort({ createdAt: -1 }).limit(10);
  history.reverse();

  // 5. Generate human-like response mimicking Sam Joshua via Azure OpenAI GPT-4o
  console.log(`\n🤖 Calling Azure OpenAI (GPT-4o) to respond like Sam Joshua...`);
  const replyText = await azureOpenAI.generateReply({
    userMemory,
    messageHistory: history,
    incomingText: incomingUserMessage
  });

  console.log(`\n💬 [Sam Joshua's Auto-Reply Sent to Instagram DM]:`);
  console.log(`👉 "${replyText}"\n`);

  // 6. Save Sam's reply in MongoDB
  await Message.create({
    senderId: "chipichappa.daily",
    recipientId: testSenderId,
    role: "assistant",
    text: replyText,
    sentByAI: true,
    timestamp: new Date()
  });

  // 7. Run background summarization and memory extraction
  console.log(`🧠 Running background AI memory & persona summarization...`);
  await memoryService.updateMemoryAsync(testSenderId);

  // 8. Inspect the updated memory in MongoDB
  const updatedMemory = await UserMemory.findOne({ senderId: testSenderId });
  console.log(`\n✅ [Updated Memory in MongoDB for this person]:`);
  console.log(`- Conversation Style: ${updatedMemory.conversationStyle}`);
  console.log(`- Relationship Type: ${updatedMemory.relationshipType}`);
  console.log(`- Extracted Facts:`, updatedMemory.facts.map(f => f.fact));
  console.log(`- Rolling Summary: ${updatedMemory.rollingSummary}`);

  console.log(`\n🎉 Pipeline completed successfully! Ready for live Instagram Webhooks.`);
  process.exit(0);
}

testHeadlessDM().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
