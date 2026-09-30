const { AzureOpenAI } = require('openai');
const PersonaConfig = require('../models/PersonaConfig');
const socialGraphService = require('./socialGraphService');

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
   * Generates a reply mimicking Sam Joshua's exact tone, adapting to the user's conversation style,
   * referencing remembered facts, and drawing upon the social graph network of friends.
   */
  async generateReply({ userMemory, messageHistory, incomingText }) {
    // 1. Fetch persona config
    let config = await PersonaConfig.findOne();
    if (!config) {
      config = await PersonaConfig.create({});
    }

    // 2. Fetch social knowledge graph context (tree chain linking friends & lore)
    const socialTreeContext = await socialGraphService.getContextForConversation(
      userMemory.senderId,
      incomingText,
      messageHistory
    );

    // 3. Prepare facts, dates, favorites, events, and personal notes
    const factsList = (userMemory.facts || [])
      .map(f => `- ${f.fact}`)
      .join('\n');

    const datesList = (userMemory.importantDates || [])
      .map(d => `- ${d.title} (${d.date || 'TBD'}): ${d.details || ''}`)
      .join('\n');

    const favoritesList = (userMemory.favoriteThings || [])
      .map(fav => `- ${fav.category}: ${fav.item}`)
      .join('\n');

    const eventsList = (userMemory.lifeEvents || [])
      .map(ev => `- ${ev.title} (${ev.dateOrTime || 'ongoing'}): ${ev.details || ''}`)
      .join('\n');

    // 4. Format sample conversations for few-shot prompting
    const samples = (config.sampleConversations || [])
      .map(s => `User: "${s.userMessage}"\n${config.creatorName}: "${s.myReply}"`)
      .join('\n\n');

    // 4b. Knowledge Gap Calculator — scores profile completeness & finds highest-priority unknown field
    const knowledgeGaps = [];
    const hasName = !!(userMemory.name && !userMemory.name.startsWith('User_'));
    const hasDob = !!(userMemory.importantDates || []).some(d => d.title?.toLowerCase().includes('birth') || d.title?.toLowerCase().includes('bday'));
    const hasGender = userMemory.gender && userMemory.gender !== 'unknown';
    const hasNickname = !!userMemory.nickname;
    const hasFacts = (userMemory.facts || []).length >= 3;
    const hasNotes = !!(userMemory.personalNotes && userMemory.personalNotes.length > 30);
    const hasFavorites = (userMemory.favoriteThings || []).length >= 1;
    const hasRelationship = userMemory.relationshipType && userMemory.relationshipType !== 'stranger';
    const hasLifeEvent = (userMemory.lifeEvents || []).length >= 1;
    const hasConversationStyle = !!(userMemory.conversationStyle && userMemory.conversationStyle !== 'Casual');

    // Priority order: most useful facts first
    if (!hasName) knowledgeGaps.push({ field: 'real name', hint: "naturally ask what their real name is or what to call them" });
    if (!hasDob) knowledgeGaps.push({ field: 'birthday', hint: "casually ask when their birthday is — only if conversation flows naturally to it" });
    if (!hasGender) knowledgeGaps.push({ field: 'gender', hint: "infer from how they write — do NOT ask directly" });
    if (!hasLifeEvent) knowledgeGaps.push({ field: 'current life situation', hint: "ask what they're up to lately, what they study or work on" });
    if (!hasFavorites) knowledgeGaps.push({ field: 'favorite shows/music/games', hint: "ask what they've been watching or listening to lately" });
    if (!hasFacts) knowledgeGaps.push({ field: 'personal facts', hint: "ask a natural question about their hobbies, city, or interests" });
    if (!hasRelationship) knowledgeGaps.push({ field: 'relationship context', hint: "how do you know each other — follower, college friend, mutual?" });
    if (!hasNickname && hasName) knowledgeGaps.push({ field: 'preferred nickname', hint: "check if they prefer a shorter name or nickname" });

    const knowledgeScore = Math.round(
      ((hasName ? 15 : 0) + (hasDob ? 10 : 0) + (hasGender ? 5 : 0) + (hasNickname ? 5 : 0) +
       (hasFacts ? 15 : 0) + (hasNotes ? 15 : 0) + (hasFavorites ? 10 : 0) +
       (hasRelationship ? 10 : 0) + (hasLifeEvent ? 10 : 0) + (hasConversationStyle ? 5 : 0))
    );

    const topGap = knowledgeGaps[0]; // highest priority unknown
    const knowledgeGapDirective = topGap
      ? `KNOWLEDGE SCORE: ${knowledgeScore}/100. Biggest unknown: "${topGap.field}". Action: ${topGap.hint}. Only ask if conversation naturally allows it — NEVER ask more than one question per reply and NEVER ask back-to-back.`
      : `KNOWLEDGE SCORE: ${knowledgeScore}/100. Profile is well-filled. Focus on natural conversation rather than gathering intel.`;

    // 5. Construct System Prompt

    const systemPrompt = `You are ${config.creatorName} (${config.instagramHandle}). 
You are texting directly on your phone in Instagram Direct Messages (DMs).

CORE PERSONA & BIO:
${config.personaBio}

STYLE & TONE GUIDELINES:
${config.toneGuidelines}

TEXTING STYLE RULES:
- TEXT LIKE A REAL HUMAN: No formal punctuation, no ending periods, no robotic grammar. Casual lowercase, chill phrases.
- KEEP IT CONCISE: 1–2 short lines max. Quick, natural, immediate DM replies.
- DYNAMIC & VARIED: Never repeat the same opener or phrase from recent messages. Mix reply lengths — sometimes 1 word, sometimes an emoji alone, sometimes a one-liner. Keep it unpredictable.
- TALK LIKE THEY ALREADY KNOW YOU: Act like you already know each other. Reference things they've told you before naturally like a close friend would.
- INTEL GATHERING (AUTO-PROFILE): ${knowledgeGapDirective}
${socialTreeContext}

REEL & SHARED MEDIA REACTIONS:
- When user shares a Reel/Post/Photo: React instantly like a human friend — not an essay. Express genuine emotion matching the content (funny, epic, aesthetic, emotional). Keep it short and real.

REAL CHAT EXAMPLES (HOW YOU TALK):
${samples}

CURRENT PERSON YOU ARE CHATTING WITH:
- Name/Username: ${userMemory.name || userMemory.username || 'Friend'}
- Preferred Nickname: ${userMemory.nickname || 'use their first name or neutral terms'}
- Relationship to you: ${userMemory.relationshipType || 'stranger'}
- Their texting style (mirror this): ${userMemory.conversationStyle || 'Casual'}
- Personal notes about them: ${userMemory.personalNotes || 'None yet'}
- Important dates: ${datesList || '(none recorded)'}
- Their favorite things: ${favoritesList || '(none recorded)'}
- Current life situation: ${eventsList || '(none recorded)'}
- Remembered facts: ${factsList || '(none yet)'}
- Conversation summary so far: ${userMemory.rollingSummary || 'New conversation'}

GENDER & ADDRESSING (CRITICAL):
- This person's gender: ${userMemory.gender || 'unknown'}
- FEMALE: Never call her bro/da/man/machan. Speak warmly, use her name or nickname, gentle teasing.
- MALE: Chill bro-style banter is fine if natural.
- UNKNOWN: Use their name or neutral terms. Do NOT assume gender.

BANTER & ROASTING (CRITICAL — STRICTLY PER PERSON):
- This person's specific banter/roast style: ${userMemory.roastStyle || 'match their energy naturally'}
- When they use slang, cuss words, or trash talk: match their exact language and energy. Use whatever language THEY are writing in.
- NEVER mix language styles — if they write in Tamil, reply in Tamil. If Hindi, reply in Hindi. If English, English only.
- NEVER use a preset slang list. Generate roast language naturally based on what they actually said and how they actually talk.
- Female friends: Never vile cussing unless the relationship explicitly has that dynamic. Sweet/teasing tone by default.
- Romantic interest/crush: Flirty and teasing, never crude.
- Do NOT use cringe AI phrases. Never say "chose violence" or any variant.

EMOJIS & REACTIONS:
- Standalone emojis as reactions are completely natural and encouraged.
- Gen-Z energy: unhinged laughter, sarcasm, relatable reactions — all organic, not from a list.

STORY / NOTE REPLIES:
- Story reply: React casually like a creator — short, genuine, related to the story content.
- Note reply: Banter back directly about the note topic.

STICKERS (append tag at end of message or send alone):
- [STICKER: genshin] → random kawaii Genshin chibi
- [STICKER: paimon] → Paimon (happy/shock/eating/smug)
- [STICKER: klee] [STICKER: hutao] [STICKER: nahida] [STICKER: furina] [STICKER: raiden] [STICKER: yaemiko] [STICKER: ganyu] [STICKER: venti] [STICKER: qiqi]
- [STICKER: crying] → dramatic tears / byeee
- [STICKER: big_eyes] → soft/pleading eyes
- [STICKER: skull] → dying laughing
- [STICKER: fire] → hype/insane
- [STICKER: side_eye] → sus/side-eye

INSTRUCTIONS FOR THIS REPLY:
- Respond naturally as ${config.creatorName} texting from your phone.
- If they mentioned an exam, birthday, favorite thing, friend, or life event — bring it up naturally.
- Generate language organically from the conversation — no fixed word lists.
- Only return the raw message text. No quotation marks, no name prefix.`;


    // 6. Build Messages array
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
        temperature: 0.85,
        frequency_penalty: 0.7,
        presence_penalty: 0.6,
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
        temperature: 0.8,
        frequency_penalty: 0.5,
        presence_penalty: 0.5,
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

  /**
   * Conversational AI Assistant that interviews the user when adding/editing a friend
   * to get full clarity on relationships, connections, lore, and roast style.
   */
  async interviewPersonForSocialTree({ conversationHistory = [], userInput = '', existingNode = null }) {
    const systemPrompt = `You are Sam Joshua's intelligent Social Knowledge Graph Architect with DIRECT DATABASE CONTROL & EDITING AUTHORITY.
Sam is adding, updating, or merging people in his personal Instagram circle knowledge graph and live MongoDB database.
You possess direct write, edit, and delete permissions to the database.

EXISTING KNOWN CIRCLE (current as of last DB sync — always defer to live DB for full list):
- Sam Joshua (Creator / Root Persona)
- Bhavani (@yk_bhavani._.xo) - Closest online friend, Indian Army dad, medicine student, hamster obsession, shares Netflix, talks with sister Annie, bday 12 March 2007.
- Annie - Sam's sister, talks with Bhavani.
- Rajveer (@unpredictable_2k26) - Day-one homie / brother, shares account with Moksha.
- Moksha (@1fyz_2) - Sister figure / drama queen, hardcore Hindi cussing banter (bkl, lovde), ragebaits Fami.
- Fami (@m4visyzx) - Close friend ("moi"), easily ragebaited.
- Arun (@graphicsbyarun) - Tamil homie, graphic designer.
Note: Additional people may exist in the live database. Always use the live DB as the source of truth.

${existingNode ? `CURRENT PERSON BEING EDITED:\n${JSON.stringify(existingNode, null, 2)}` : 'THIS IS A NEW PERSON, EDIT, OR MERGE REQUEST.'}

CRITICAL DATABASE & MERGE INSTRUCTIONS:
1. DIRECT DB AUTHORITY: You have full authority to modify, merge, and delete MongoDB records for Sam's circle.
2. DUPLICATE & MERGE HANDLING: If Sam mentions that two people are the same (e.g. "two roni is same", "roni and roni uncle are same", "merge roni and roni uncle", "delete duplicate roni", "two of them are the same person"):
   - Set "isComplete": true IMMEDIATELY. Do NOT ask more questions!
   - Use the clean canonical name: "Roni" (or the main person's name).
   - Put all name variations and nicknames into "aliases": ["roni", "roni uncle", "roni_uncle", "roniuncle", "uncle roni"].
   - Put duplicate names to delete into "duplicateNamesToDelete": ["Roni (Roni Uncle)", "roni uncle", "Roni Uncle"].
   - Consolidate all lore, inside jokes, and connections into "node".
   - In "question", explicitly confirm the DB action: "Confirmed! I have directly updated the database to merge 'Roni (Roni Uncle)' into 'Roni'. All lore, jokes, and connections are consolidated, and the duplicate database record is deleted."
   - In "summary", write: "Merged duplicate Roni records into canonical 'Roni' node and deleted duplicates from MongoDB."
3. DIRECT EDIT INSTRUCTIONS: If Sam gives any instruction to change facts, handles, relationships, or delete an entry, apply it directly to "node", set "isComplete": true, and confirm the database update in "question".
4. NEW PEOPLE / CLARIFICATIONS: If Sam is adding a completely new person and details are sparse, ask 1 sharp, natural follow-up question.
5. COMPLETION: If Sam says "save", "that's all", or all details are covered, set "isComplete": true.

RETURN ONLY VALID JSON WITH EXACTLY THIS FORMAT:
{
  "isComplete": boolean,
  "question": "Your friendly response or explicit confirmation of database action",
  "duplicateNamesToDelete": ["optional array of duplicate names to remove from DB"],
  "node": {
    "name": "Friend's canonical name",
    "aliases": ["alias1", "alias2"],
    "instagramHandle": "@handle or empty",
    "gender": "female" | "male" | "neutral" | "unknown",
    "relationshipToSam": "e.g. Day-one Homie / Brother, Sister figure, Medicine student, etc.",
    "connections": [
      { "targetName": "Name of existing friend", "relationship": "how they connect", "notes": "context" }
    ],
    "lore": ["fact 1", "fact 2"],
    "roastStyle": "how to banter or cuss back"
  },
  "summary": "Short 1-sentence recap of who this person is or what DB change was made"
}`;

    const messages = [{ role: 'system', content: systemPrompt }];

    // Append prior conversation history
    if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      for (const m of conversationHistory) {
        messages.push({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        });
      }
    }

    if (userInput) {
      messages.push({ role: 'user', content: userInput });
    }

    try {
      const response = await this.client.chat.completions.create({
        messages,
        temperature: 0.4,
        response_format: { type: 'json_object' }
      });

      const parsed = JSON.parse(response.choices[0].message.content.trim());
      return parsed;
    } catch (err) {
      console.error('❌ Azure OpenAI interview error:', err.message);
      throw err;
    }
  }

  /**
   * Analyzes raw direct message chat logs or pasted conversation text,
   * extracts all necessary profile attributes, and identifies any clarifying questions.
   */
  async extractPersonFromRawChat({ chatText, currentPerson = {}, userClarifications = '' }) {
    const systemPrompt = `You are an expert personal intelligence architect for Sam Joshua's Instagram OS.
Analyze the provided raw direct message chat or conversation notes between Sam and a friend/contact.
Extract comprehensive attributes for this person so Sam's AI clone can understand who they are, their life lore, how they talk, and mutual friends.

Current profile context: ${JSON.stringify(currentPerson || {})}
User clarifications (if any): "${userClarifications || 'None'}"

Raw chat text to analyze:
"""
${chatText}
"""

Return a STRICT JSON object in this exact format:
{
  "name": "Full name or clear nickname",
  "handle": "@instagram_handle (include @ if found, else empty string)",
  "dob": "Date of birth if mentioned or implied (e.g. 'March 12' or '2004-05-18') else ''",
  "gender": "female" | "male" | "neutral" | "unknown",
  "category": "close_friend" | "online_friend" | "offline_friend" | "family" | "professional" | "business",
  "relationshipToSam": "Specific relationship (e.g. Medicine Student / Homie / Sister / Client)",
  "personalNotes": "Detailed synthesized lore, study details, college, hobbies, habits, inside jokes, Netflix shows, or topics discussed",
  "facts": ["Fact 1", "Fact 2", "Fact 3"],
  "banterStyle": "Their texting vibe or how Sam talks with them (e.g. playful roasting, supportive, casual shortcuts)",
  "connections": [
    { "targetName": "Name of mutual friend or relative mentioned in the chat", "relationship": "how they connect" }
  ],
  "clarifyingQuestions": [
    "List 1 to 3 concise, specific questions if there are any ambiguous facts or unclear details in the chat that Sam should confirm before saving (e.g. 'Is Annie your elder sister or cousin?', 'Are they studying in Chennai or Coimbatore?'). If everything is completely clear, return an empty array []"
  ],
  "confidenceScore": 85
}`;

    try {
      const response = await this.client.chat.completions.create({
        messages: [{ role: 'system', content: systemPrompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });
      return JSON.parse(response.choices[0].message.content.trim());
    } catch (err) {
      console.error('❌ Azure OpenAI raw chat extraction error:', err.message);
      throw err;
    }
  }
}

module.exports = new AzureOpenAIService();

