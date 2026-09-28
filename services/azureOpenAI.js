const { AzureOpenAI } = require('openai');
const PersonaConfig = require('../models/PersonaConfig');

class AzureOpenAIService {
  constructor() {
    this.client = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview",
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o",
    });
  }

  /**
   * Generates a reply mimicking Sam Joshua's exact tone, adapting to the user's conversation style
   * and referencing remembered facts.
   */
  async generateReply({ userMemory, messageHistory, incomingText }) {
    // 1. Fetch persona config
    let config = await PersonaConfig.findOne();
    if (!config) {
      config = await PersonaConfig.create({});
    }

    // 2. Prepare facts summary
    const factsList = (userMemory.facts || [])
      .map(f => `- ${f.fact}`)
      .join('\n');

    // 3. Format sample conversations for few-shot prompting
    const samples = (config.sampleConversations || [])
      .map(s => `User: "${s.userMessage}"\n${config.creatorName}: "${s.myReply}"`)
      .join('\n\n');

    // 4. Construct System Prompt
    const systemPrompt = `You are ${config.creatorName} (${config.instagramHandle}). 
You are texting directly with people on your Instagram Direct Messages (DMs).

CORE PERSONA & BIO:
${config.personaBio}

STYLE & TONE GUIDELINES:
${config.toneGuidelines}

FACTS ABOUT YOU & YOUR WORK:
${config.customKnowledge}

FORBIDDEN PATTERNS:
- Do NOT use formal bot greetings (e.g., "Hello! How can I help you today?").
- Do NOT say "As an AI..." or "I don't have feelings". You ARE Sam Joshua texting on his phone.
- Keep replies short and human: usually 1 to 2 sentences, occasionally 3 if explaining something.
- Never write robotic paragraphs. Real people text quickly and casually.
- Forbidden words to avoid: ${config.forbiddenWords.join(', ')}

REAL CHAT EXAMPLES (HOW YOU TALK):
${samples}

CURRENT PERSON YOU ARE CHATTING WITH:
- Name/Username: ${userMemory.name || userMemory.username || 'Friend'}
- Relationship: ${userMemory.relationshipType || 'stranger'}
- Their Communication Style: ${userMemory.conversationStyle || 'Casual'}
- Facts you remember about them:
${factsList || '(No prior facts recorded yet)'}
- Previous context summary: ${userMemory.rollingSummary || 'New conversation'}

INSTRUCTIONS FOR THIS REPLY:
- Respond naturally as ${config.creatorName}.
- Match their tone and energy subtly while maintaining your own authentic voice.
- If relevant, refer naturally to previous context or things you know about them.
- Only return the reply message text. Do NOT add quotes, labels, or prefixes like "${config.creatorName}:".`;

    // 5. Build Messages array
    const messages = [{ role: 'system', content: systemPrompt }];

    // Add recent history (up to last 10 messages)
    if (messageHistory && messageHistory.length > 0) {
      for (const msg of messageHistory) {
        messages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.text,
        });
      }
    }

    // Add current incoming message
    messages.push({
      role: 'user',
      content: incomingText,
    });

    try {
      const response = await this.client.chat.completions.create({
        messages,
        temperature: 0.75,
        max_tokens: 250,
      });

      let reply = response.choices[0].message.content.trim();

      // Post-process to remove unwanted quotes or prefixes
      reply = reply.replace(/^"|"$/g, '').trim();
      if (reply.startsWith(`${config.creatorName}:`)) {
        reply = reply.replace(`${config.creatorName}:`, '').trim();
      }

      return reply;
    } catch (err) {
      console.error('❌ Azure OpenAI generation error:', err.message);
      throw err;
    }
  }

  /**
   * Generates a natural, friendly follow-up check-in when a conversation has been inactive for 5-6 hours
   */
  async generateFollowUpReminder({ userMemory, messageHistory }) {
    let config = await PersonaConfig.findOne();
    if (!config) {
      config = await PersonaConfig.create({});
    }

    const systemPrompt = `You are ${config.creatorName} (${config.instagramHandle}).
You are sending a thoughtful, casual follow-up or check-in to someone on Instagram DM because your previous conversation stopped 5 to 6 hours ago.

CORE PERSONA & BIO:
${config.personaBio}

STYLE & TONE GUIDELINES:
${config.toneGuidelines}

RULES:
- Keep it concise: 1 short sentence, max 2.
- Feel natural, friendly, and authentic (e.g. checking how they are doing, checking in on what they were working on, or a chill emoji).
- Never sound robotic or pushy.
- Return ONLY the reply message text.`;

    const messages = [{ role: 'system', content: systemPrompt }];

    if (messageHistory && messageHistory.length > 0) {
      for (const msg of messageHistory) {
        messages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.text,
        });
      }
    }

    messages.push({
      role: 'user',
      content: `[System Note: 5-6 hours have passed since our last message. Send a casual, authentic check-in / follow-up message to ${userMemory.name || userMemory.username}.]`,
    });

    try {
      const response = await this.client.chat.completions.create({
        messages,
        temperature: 0.75,
        max_tokens: 150,
      });

      let reply = response.choices[0].message.content.trim();
      reply = reply.replace(/^"|"$/g, '').trim();
      if (reply.startsWith(`${config.creatorName}:`)) {
        reply = reply.replace(`${config.creatorName}:`, '').trim();
      }
      return reply;
    } catch (err) {
      console.error('❌ Azure OpenAI reminder generation error:', err.message);
      return null;
    }
  }
}

module.exports = new AzureOpenAIService();
