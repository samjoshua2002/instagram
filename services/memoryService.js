const { AzureOpenAI } = require('openai');
const UserMemory = require('../models/UserMemory');
const Message = require('../models/Message');

class MemoryService {
  constructor() {
    this.client = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview",
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o",
    });
  }

  /**
   * Get or create memory record for an Instagram user
   */
  async getOrCreateUserMemory(senderId, profileData = null) {
    let memory = await UserMemory.findOne({ senderId });
    if (!memory) {
      memory = new UserMemory({
        senderId,
        username: profileData?.username || `User_${senderId.slice(-4)}`,
        name: profileData?.name || '',
        profilePic: profileData?.profile_pic || '',
      });
      await memory.save();
    } else if (profileData) {
      if (profileData.username && memory.username.startsWith('User_')) {
        memory.username = profileData.username;
      }
      if (profileData.name && !memory.name) {
        memory.name = profileData.name;
      }
      if (profileData.profile_pic) {
        memory.profilePic = profileData.profile_pic;
      }
      await memory.save();
    }
    return memory;
  }

  /**
   * Asynchronously updates the user's memory, conversation style analysis,
   * facts extracted, and rolling summary.
   */
  async updateMemoryAsync(senderId) {
    try {
      const memory = await UserMemory.findOne({ senderId });
      if (!memory) return;

      // Fetch the last 15 messages for this user
      const recentMessages = await Message.find({
        $or: [{ senderId }, { recipientId: senderId }]
      })
      .sort({ createdAt: -1 })
      .limit(15);

      recentMessages.reverse();

      if (recentMessages.length < 2) {
        // Not enough context yet to update memory
        return;
      }

      const formattedChat = recentMessages
        .map(m => `${m.role === 'assistant' ? 'Sam' : 'User'}: ${m.text}`)
        .join('\n');

      const currentFacts = (memory.facts || []).map(f => f.fact).join('; ');

      const prompt = `Analyze this Instagram DM exchange between Creator Sam Joshua and a user.
Extract updated intelligence about the user. Return ONLY a valid JSON object.

CURRENT KNOWLEDGE:
- User style: ${memory.conversationStyle}
- Existing facts: ${currentFacts || 'None'}
- Prior summary: ${memory.rollingSummary}

CHAT LOG:
${formattedChat}

Return a valid JSON object with EXACTLY this structure:
{
  "conversationStyle": "Short description of how this user talks (e.g., uses lots of slang, emojis, direct business tone, formal, hype)",
  "relationshipType": "one of: stranger, fan, client, collaborator, friend",
  "newFacts": ["fact 1", "fact 2"],
  "rollingSummary": "Concise 1-3 sentence summary of the key context and ongoing relationship."
}
Only extract true, concrete facts mentioned by the user (like their profession, interests, location, project requests). Do not invent information. If no new facts, keep newFacts empty.`;

      const response = await this.client.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a chat memory and persona analyst. Always output pure valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const parsed = JSON.parse(response.choices[0].message.content.trim());

      if (parsed.conversationStyle) {
        memory.conversationStyle = parsed.conversationStyle;
      }
      if (parsed.relationshipType) {
        memory.relationshipType = parsed.relationshipType;
      }
      if (parsed.rollingSummary) {
        memory.rollingSummary = parsed.rollingSummary;
      }

      if (Array.isArray(parsed.newFacts) && parsed.newFacts.length > 0) {
        const existingFactTexts = new Set(memory.facts.map(f => f.fact.toLowerCase()));
        for (const factStr of parsed.newFacts) {
          if (factStr && !existingFactTexts.has(factStr.toLowerCase())) {
            memory.facts.push({ fact: factStr });
            existingFactTexts.add(factStr.toLowerCase());
          }
        }
      }

      memory.messageCount = (memory.messageCount || 0) + 1;
      memory.lastInteraction = new Date();
      await memory.save();

      console.log(`🧠 Memory updated for ${memory.username || senderId}: Style="${memory.conversationStyle}", Facts=${memory.facts.length}`);
    } catch (err) {
      console.error('❌ Error updating user memory:', err.message);
    }
  }
}

module.exports = new MemoryService();
