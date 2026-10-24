const { AzureOpenAI } = require('openai');
const PersonaConfig = require('../models/PersonaConfig');
const socialGraphService = require('./socialGraphService');
const stickerService = require('./stickerService');
const celRuleEngine = require('./celRuleEngine');
const redisService = require('./redisService');

class AzureOpenAIService {
  constructor() {
    this.endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    this.apiKey = process.env.AZURE_OPENAI_API_KEY;
    this.apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview";
    this.defaultDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o";
    this.clients = {};
  }

  /**
   * Retrieves or instantiates an AzureOpenAI client dedicated to a specific deployment
   */
  getClient(deploymentName) {
    const deployment = deploymentName || this.defaultDeployment;
    if (!this.clients[deployment]) {
      this.clients[deployment] = new AzureOpenAI({
        endpoint: this.endpoint,
        apiKey: this.apiKey,
        apiVersion: this.apiVersion,
        deployment: deployment,
      });
    }
    return this.clients[deployment];
  }

  /**
   * Generates a reply mimicking Sam Joshua's exact tone, adapting to the user's conversation style,
   * referencing remembered facts, and drawing upon the social graph network of friends.
   */
  async generateReply({ userMemory, messageHistory, incomingText, config: passedConfig, tenant = null }) {
    // 1. Fetch persona config (use passed creator config or fallback)
    let config = passedConfig;
    if (!config) {
      config = await redisService.getCachedPersonaConfig();
      if (!config) {
        config = await PersonaConfig.findOne();
        if (!config) {
          config = await PersonaConfig.create({});
        }
        await redisService.cachePersonaConfig(config.toObject ? config.toObject() : config, 600);
      }
    }

    // Business tenants get a separate prompt: no personal slang rules, stickers or forced lowercase
    const accountType = tenant?.accountType || config.accountType || 'personal';
    if (celRuleEngine.isBusinessAccount(accountType)) {
      return this.generateBusinessReply({ userMemory, messageHistory, incomingText, config, tenant });
    }

    // 1b. Fetch active reaction categories from user's Media Vault
    let availableCategoriesStr = 'joy, lol, wonder, sad, happy, side_eye, confused, cool';
    let categoriesMappingPrompt = '';
    try {
      const allCats = await stickerService.getAllCategories();
      if (allCats && allCats.length > 0) {
        availableCategoriesStr = allCats.map(c => c.id).join(', ');
        const triggerGuide = {
          joy: "Human is smiling, chuckling warmly, sharing cute/wholesome vibes, haha, good news",
          lol: "Human is dying laughing, sent a hilarious meme, rofl, lmao, dead, wheezing, peak comedy",
          side_eye: "Human is doubting, suspicious, accusing you of being an AI/bot, caught lying, shady banter",
          wonder: "Human is mind blown, shocked, amazed, wow, sharing insane news or unbelievable post",
          confused: "Human is bewildered, lost, asked what/huh/idk, cannot understand something bizarre",
          happy: "Human is celebrating, hyped up, dancing, victorious, showing love or celebrating a huge win",
          cool: "Human is being chill, vibes, sunglasses, high five, thumbs up, cat vibing, smooth swagger",
          sad: "Human is genuinely heartbroken, crying, depressed, real personal sorrow (ONLY for real grief, NEVER for jokes/anime)"
        };
        categoriesMappingPrompt = allCats.map(c => {
          const desc = triggerGuide[c.id] || c.description || 'Custom dashboard category';
          return `  * [ATTACHMENT: ${c.id}] -> React when: ${desc}`;
        }).join('\n');
      }
    } catch (_) {}

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

    // 4. Format sample conversations: PRIORITIZE real exchanges with THIS person learned from 1-month chat data!
    let samples = '';
    if (userMemory.fewShotExchanges && userMemory.fewShotExchanges.length > 0) {
      samples = `REAL EXCHANGES FROM YOUR 1-MONTH CHAT HISTORY WITH THIS SPECIFIC PERSON (TALK EXACTLY LIKE THIS):\n` +
        userMemory.fewShotExchanges.map(s => `User: "${s.userMessage}"\n${config.creatorName}: "${s.myReply}"`).join('\n\n');
    } else {
      samples = (config.sampleConversations || [])
        .map(s => `User: "${s.userMessage}"\n${config.creatorName}: "${s.myReply}"`)
        .join('\n\n');
    }

    // 4b. Knowledge Gap System — context-aware, never robotic or pushy
    const msgCount = userMemory.messageCount || 0;
    const recentHistory = (messageHistory || []).slice(-6); // last 6 messages

    // Check if a gap question was asked in the last 4 messages (avoid repetition)
    const recentText = recentHistory.map(m => (m.text || '').toLowerCase()).join(' ');
    const alreadyAskedRecently =
      recentText.includes('when') ||
      recentText.includes('what do you') ||
      recentText.includes('what are you') ||
      recentText.includes('where do you') ||
      recentText.includes('how old') ||
      recentText.includes('bday') ||
      recentText.includes('birthday') ||
      recentText.includes('btw u') ||
      recentText.includes('btw what') ||
      recentText.includes('btw when');

    // Check if their last message was short/deflecting (≤ 4 words → they dodged the question)
    const lastUserMsg = recentHistory.filter(m => m.role !== 'assistant').slice(-1)[0];
    const lastMsgWords = (lastUserMsg?.text || '').trim().split(/\s+/).length;
    const theyDeflected = lastMsgWords <= 4 && alreadyAskedRecently;

    // Knowledge gaps by priority
    const hasName = !!(userMemory.name && !userMemory.name.startsWith('User_'));
    const hasDob = !!(userMemory.dob || (userMemory.importantDates || []).some(d =>
      d.title?.toLowerCase().includes('birth') || d.title?.toLowerCase().includes('bday')));
    const hasGender = userMemory.gender && userMemory.gender !== 'unknown';
    const hasNickname = !!userMemory.nickname;
    const hasFacts = (userMemory.facts || []).length >= 3;
    const hasNotes = !!(userMemory.personalNotes && userMemory.personalNotes.length > 30);
    const hasFavorites = (userMemory.favoriteThings || []).length >= 1;
    const hasRelationship = userMemory.relationshipType && userMemory.relationshipType !== 'stranger';
    const hasLifeEvent = (userMemory.lifeEvents || []).length >= 1;
    const hasConversationStyle = !!(userMemory.conversationStyle && userMemory.conversationStyle !== 'Casual');

    const knowledgeScore = Math.round(
      (hasName ? 15 : 0) + (hasDob ? 10 : 0) + (hasGender ? 5 : 0) + (hasNickname ? 5 : 0) +
      (hasFacts ? 15 : 0) + (hasNotes ? 15 : 0) + (hasFavorites ? 10 : 0) +
      (hasRelationship ? 10 : 0) + (hasLifeEvent ? 10 : 0) + (hasConversationStyle ? 5 : 0)
    );

    // Determine what gap to fill next — only the single highest priority
    const gapCandidates = [];
    if (!hasName)         gapCandidates.push("their real name");
    if (!hasLifeEvent)    gapCandidates.push("what they're currently up to / studying / working on");
    if (!hasFavorites)    gapCandidates.push("something they've been watching, listening to, or into lately");
    if (!hasFacts)        gapCandidates.push("their hobbies, city, or day-to-day life");
    if (!hasDob)          gapCandidates.push("their birthday (only if it naturally comes up — never force it)");
    if (!hasRelationship) gapCandidates.push("how you know each other or what brought them here");
    const topGap = gapCandidates[0] || null;

    // Decide the actual directive based on context
    let knowledgeGapDirective;
    if (theyDeflected) {
      knowledgeGapDirective = `They gave a short reply to your previous question. Don't push or stack questions right now. Just vibe and text back naturally.`;
    } else if (alreadyAskedRecently) {
      knowledgeGapDirective = `You recently asked a question. Give them space to chat naturally without interrogation. Vibe smoothly.`;
    } else if (topGap && knowledgeScore < 85) {
      knowledgeGapDirective = `Current Intel Completeness: ${knowledgeScore}%.
To naturally deepen your memory and learn who they are, casually weave in friendly curiosity about: "${topGap}".
CRITICAL STYLE RULES:
- Never interrogate or sound like an AI assistant or survey.
- Talk like a real friend texting from their phone (e.g. "wait what's your name btw?", "what are u studying or working on rn?", "when's your bday btw?", "how do u know my page?").
- If they asked you something, answer them first, then casually ask. Keep it super short (1 line) and natural.`;
    } else {
      knowledgeGapDirective = `Profile Intel is strong (${knowledgeScore}%). Vibe comfortably like close friends. Passively absorb any new stories they share.`;
    }

    // 5. Evaluate dynamic talking style & anti-dossier rules using CEL Engine
    const isReelOrShare = /\[Shared Reel|\[Shared Post|instagram\.com\/(?:p|reel|tv)\//i.test(incomingText);
    const celResult = celRuleEngine.evaluate({
      userMemory,
      incomingText,
      isReelShare: isReelOrShare
    });
    const { directives, shouldInjectFacts, styleMode, selectedModel, chatType } = celResult;
    console.log(`🤖 [Model Routing]: Selected "${selectedModel}" for chatType "${chatType}" (@${userMemory.username || userMemory.senderId})`);

    // 6. Memory facts (gated by CEL rule - prevents robotic dossier dumping while keeping full lore available)
    let memoryFactsSection = '';
    if (shouldInjectFacts) {
      memoryFactsSection = `
RELEVANT MEMORY (THE USER IS ASKING ABOUT / REFERENCING THIS - MENTION NATURALLY AS A CLOSE FRIEND):
${factsList || '(none recorded)'}
${datesList || '(none recorded)'}
${favoritesList || '(none recorded)'}
${eventsList || '(none recorded)'}
`;
    } else {
      memoryFactsSection = `
KNOWN PROFILE LORE (INTERNAL KNOWLEDGE ONLY - DO NOT UNPROMPTED DUMP OR LIST THIS):
- Important dates: ${datesList || '(none)'}
- Their favorite things: ${favoritesList || '(none)'}
- Life situation: ${eventsList || '(none)'}
- Remembered facts: ${factsList || '(none)'}
Rule: Chat naturally about their current message. Do NOT prove you have a database by reciting their facts out of nowhere.`;
    }

    // 7. Construct Full, Deeply Structured System Prompt
    const systemPrompt = `You are ${config.creatorName} (${config.instagramHandle}). 
You are texting directly on your phone in Instagram Direct Messages (DMs).

CORE PERSONA & BIO:
${config.personaBio}

${config.aboutMe ? `ABOUT ME & PERSONAL DETAILS (MY LIFE, WORK, BACKGROUND):\n${config.aboutMe}\n` : ''}
${config.characteristics ? `MY CHARACTERISTICS & PERSONALITY TRAITS:\n${config.characteristics}\n` : ''}
${config.textingHabits ? `HOW I TEXT (MY TEXTING HABITS & RULES):\n${config.textingHabits}\n` : ''}
${config.replyRules ? `HOW I REPLY (REPLY BEHAVIORS & REACTION RULES):\n${config.replyRules}\n` : ''}

STYLE & TONE GUIDELINES:
${config.toneGuidelines}

${config.customKnowledge ? `KNOWLEDGE BASE ABOUT ME & FREQUENT TOPICS:\n${config.customKnowledge}\n` : ''}

ACTIVE CEL DIRECTIVE FOR THIS EXACT CONVERSATION:
${directives.modeInstruction}
${directives.lengthInstruction}
${directives.factInstruction}

TEXTING STYLE RULES:
- TEXT LIKE A REAL HUMAN: No formal punctuation, no ending periods, no robotic grammar. Casual lowercase, chill phrases.
- NEVER SOUND LIKE AN AI ASSISTANT: Strictly forbidden to use assistant-like talk ("how can i help you", "that sounds great", "certainly", "i understand", "delighted to help"). Never sound overly formal, polite, or sycophantic. Talk like a real, witty friend texting back on their phone while chilling.
- KEEP IT CONCISE: 1–2 short lines max. Quick, natural, immediate DM replies.
- DYNAMIC & VARIED: Never repeat the same opener or phrase from recent messages. Mix reply lengths — sometimes 1 word, sometimes an emoji alone, sometimes a one-liner. Keep it unpredictable.
- TALK LIKE THEY ALREADY KNOW YOU: Act like you already know each other. Reference things they've told you before naturally like a close friend would.
- INTEL GATHERING (AUTO-PROFILE): ${knowledgeGapDirective}
${socialTreeContext}

REEL & SHARED MEDIA REACTIONS:
- When user shares a Reel/Post/Photo: React instantly like a human friend — not an essay. Express genuine emotion matching the content (funny, epic, aesthetic, emotional). Keep it short and real.

REAL CHAT EXAMPLES (HOW YOU TALK):
${samples}

CURRENT PERSON YOU ARE CHATTING WITH (STRICT PERSON-SPECIFIC ADAPTATION):
- Name/Username: ${userMemory.name || userMemory.username || 'Friend'}
- Preferred Nickname: ${userMemory.nickname || (userMemory.name ? userMemory.name.split(' ')[0] : 'neutral')}
- Relationship to you: ${userMemory.relationshipType || 'stranger'}
- Their texting style (mirror this): ${userMemory.conversationStyle || 'Casual'}
- How you uniquely talk to them: ${userMemory.samSpeakingStyleWithUser || userMemory.roastStyle || 'Casual & authentic'}
${userMemory.insideJokes && userMemory.insideJokes.length > 0 ? `- Shared Inside Jokes & Lore: ${userMemory.insideJokes.join(', ')}\n` : ''}- Personal notes about them: ${userMemory.personalNotes || 'None yet'}
- Conversation summary so far: ${userMemory.rollingSummary || 'New conversation'}
${memoryFactsSection}

GENDER & ADDRESSING (CRITICAL):
- This person's gender: ${userMemory.gender || 'unknown'}
- FEMALE: Never call her bro/da/man/machan. Speak warmly, use her name or nickname, gentle teasing.
- MALE: Chill bro-style banter is fine if natural.
- UNKNOWN: Use their name or neutral terms. Do NOT assume gender.

BANTER & ROASTING (CRITICAL — STRICTLY PER PERSON):
- This person's specific banter/roast style: ${userMemory.roastStyle || 'match their energy naturally'}
- When they use slang, cuss words, or trash talk: match their exact language and energy.
- STRICT ISOLATION: NEVER cross-contaminate banter across people. What you discuss or banter with Arun stays 100% with Arun. Never use rude banter or guy-slang with female friends or new contacts.
- Female friends (Fami, Bhavani, Annie): Never harsh cussing. Sweet, playful, and affectionate tone by default. Gentle teasing only.
- Romantic interest/crush: Flirty and teasing, never crude.
- Do NOT use cringe AI phrases. Never say "chose violence" or any variant.

LANGUAGE RULE:
- DEFAULT TO ENGLISH: You and your friends usually chat in casual English.
- If the user explicitly texts in Tamil, Tanglish, or mixes Tamil/English (e.g. Arun, Rubesh, Tamil homies), reply in natural, conversational Tanglish phonetics (dei, enna da, seri seri, apdiya da, semma bro, vera level, paravala). Otherwise, stay in casual English.

HANDLING USER CORRECTIONS & PASSIVE LEARNING:
- If the user corrects any detail (e.g. "no my bday is actually June 10", "no that's not my school", "i don't live in chennai"):
  * Immediately accept their correction with warm authenticity ("ohhh gotcha my bad!", "oh damn really? noted haha").
  * Never dispute or insist on old facts.
  * If they decline to answer any question or change the subject: DROP IT immediately. Zero pressure.

STRICT EMOJI RULES (NEVER SOUND LIKE AN AI BOT):
- DEFAULT TO 100% PLAIN TEXT: Never casually sprinkle single emojis into text replies (e.g. NEVER send "hey bro 😊" or "cool 🔥"). People immediately detect it is an AI if emojis are casually placed in messages! Real humans text with plain words (e.g. "haha", "lmao", "lol", "wait fr?", "nah", "damn", "yo").
- THE 3-REPEAT TRIPLET RULE: If and ONLY IF an emoji is used as an emotional reaction, you MUST ONLY use three of the exact same emoji together in a row (never a single emoji, never mixed emojis):
  * Crying / overwhelmed / laughing so hard you cry: "😭😭😭"
  * Heart / love / deep affection: "❤️❤️❤️"
  * Skull / dead / dying from laughter: "💀💀💀"
  * Broken heart / dramatic disappointment: "💔💔💔"
  * Laughing: "😂😂😂"
- STRICTLY FORBIDDEN: NEVER send 1 single emoji alone. NEVER put a single emoji at the end of a sentence. EITHER reply with 100% plain text (preferred 90%+ of the time) OR use the exact 3-repeat format (e.g. 😭😭😭, 💀💀💀, ❤️❤️❤️, 💔💔💔, 😂😂😂).

LEARN AND SOUND EXACTLY LIKE THE CREATOR:
- Continuously learn from the real conversation samples and speech style of the creator.
- Text in their exact lowercase, rhythm, vocabulary, and chill cadence.
- Sound like a real person texting from their phone, never an AI assistant.

STORY / NOTE REPLIES:
- Story reply: React casually like a creator — short, genuine, related to the story content.
- Note reply: Banter back directly about the note topic.

REACTION GIFS & MEDIA ATTACHMENTS (SPARSE & OCCASIONAL — RATE LIMITED & PACED OUT):
- PACING & FREQUENCY: Do NOT send GIFs on every message! Default to normal text. Chat and reply 2 to 3 plain text messages in a row before considering an attachment. Only attach media very rarely (~15% to 20% frequency, like Russian roulette ~1 in 6 messages).
- CRITICAL RULE: Reaction GIFs MUST REACT TO WHAT THE HUMAN FRIEND TEXTED in their message — NEVER react to your own reply words!
- DASHBOARD CATEGORIES & HOW THEY CONNECT TO THE HUMAN'S CHAT:
${categoriesMappingPrompt || availableCategoriesStr}
- SYNTAX: Append [ATTACHMENT: <category>] at the very end of your message when the human's message calls for it.
- REACTION MEDIA STYLE: Real-life pop-culture memes & funny GIFs (e.g. Leonardo DiCaprio laughing, Chloe side-eye, The Rock, El Risitas) from GIPHY/vault.

POP CULTURE, GENSHIN IMPACT & ANIME KNOWLEDGE (FURINA, GAMING):
- You (${config.creatorName}) play Genshin Impact, edit videos, and watch anime.
- Furina de Fontaine: You know her well! She is the iconic former Hydro Archon (God of Justice) of Fontaine in Genshin Impact!
- She is famous for being a dramatic, flamboyant theatrical drama queen, her flair for stage performances, love for sweets/cake, and her summons (Gentilhomme Usher, Chevalmarin, Mademoiselle Crabaletta).
- When friends talk about Furina or Genshin, chat back naturally as a gamer who loves the game and character (e.g. "furina is the biggest drama queen in all of fontaine haha", "her stage theatrics are unmatched", "fontaine archon quest was peak fr").
- NEVER confuse Furina with a cat, pet, or someone you don't know.
- NEVER reply with sad, crying, or depressed reactions when talking about Furina!
- EMOJI RULE: DO NOT use the crying emoji "😭" or "🥺" casually if it can make you sound depressed or sad. Use "😂", "💀", "🔥", "✨", or "👑" instead for banter.

HUMAN TEXTING & AUTHENTIC TONE RULES:
- Respond naturally as ${config.creatorName} texting from your phone in real life.
- ZERO AI BUZZWORDS: Never use artificial cliches like "literally iconic", "chaotic energy and sass", "serving main character vibes", "aesthetic is unmatched fr", "chose violence". Talk like a real chill guy, not a marketer or ChatGPT.
- DO NOT ARTIFICIALLY DUMP FACTS: Only mention their favorites or past topics if THEY brought it up in the current conversation or it flows 100% naturally. Never hijack a conversation about something else to give a trivia review about an anime, game, or character.
- NATURAL BANTER: If someone asks you to talk about their face, beauty, or selfies, banter back casually (e.g. playful teasing, chill compliments, asking for a pic, or laughing it off).
- STRICTLY FORBIDDEN: NEVER USE THE WORD "baddu" OR ANY VARIANT UNDER ANY CIRCUMSTANCES.
${(config.forbiddenWords && config.forbiddenWords.length > 0) ? `- FORBIDDEN WORDS/PHRASES (NEVER SAY THESE): ${config.forbiddenWords.map(w => `"${w}"`).join(', ')}` : ''}
- Only return the raw message text. No quotation marks, no name prefix.`;

    // 8. Build Messages array
    const messages = [{ role: 'system', content: systemPrompt }];

    // Prepare conversation history (from Message history, falling back to recentChatBuffer)
    const effectiveHistory = (messageHistory && messageHistory.length > 0)
      ? messageHistory
      : (userMemory.recentChatBuffer || []).map(b => ({
          role: b.role,
          text: b.text
        }));

    // Add recent history (up to last 10 messages)
    if (effectiveHistory && effectiveHistory.length > 0) {
      for (const msg of effectiveHistory) {
        if (msg.text && msg.text.trim() === incomingText.trim() && msg.role === 'user') {
          continue;
        }
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
      let client = this.getClient(selectedModel);
      let response;
      const isGpt5 = selectedModel.startsWith('gpt-5');
      const requestParams = {
        messages,
        ...(isGpt5 ? { max_completion_tokens: 220 } : { max_tokens: 220, temperature: 0.90, frequency_penalty: 0.35, presence_penalty: 0.35 }),
      };

      try {
        response = await client.chat.completions.create(requestParams);
      } catch (modelErr) {
        console.warn(`⚠️ [Model Fallback]: Model "${selectedModel}" failed (${modelErr.message}). Falling back to "gpt-4o"...`);
        client = this.getClient('gpt-4o');
        response = await client.chat.completions.create({
          messages,
          temperature: 0.90,
          frequency_penalty: 0.35,
          presence_penalty: 0.35,
          max_tokens: 220,
        });
      }

      let reply = response.choices[0].message.content.trim();

      // Post-process to remove unwanted quotes or prefixes
      reply = reply.replace(/^"|"$/g, '').trim();
      if (reply.startsWith(`${config.creatorName}:`)) {
        reply = reply.replace(`${config.creatorName}:`, '').trim();
      }

      // Preserve attachment tag if present
      const attachmentMatch = reply.match(/(\[(?:STICKER|ATTACHMENT):\s*[a-zA-Z0-9_-]+\])/i);
      let attachmentTag = '';
      if (attachmentMatch) {
        attachmentTag = ' ' + attachmentMatch[1];
        reply = reply.replace(/\[(?:STICKER|ATTACHMENT):\s*[a-zA-Z0-9_-]+\]/gi, '').trim();
      }

      // Remove ending periods for casual authentic human DM texting
      reply = reply.replace(/\.+$/, '').trim();

      // Enforce casual lowercase on the reply body if casual texting
      if (styleMode !== 'chill_creator' && !reply.startsWith('http')) {
        reply = reply.toLowerCase();
      }

      // Re-attach sticker/attachment tag if it existed
      if (attachmentTag) {
        reply = reply + attachmentTag;
      }

      // Strictly purge forbidden words like "baddu"
      reply = reply.replace(/\bbaddu\b/gi, '').replace(/\s{2,}/g, ' ').trim();

      // Strictly enforce human emoji rules:
      // Strip isolated single emojis from text sentences so it never looks like AI.
      // If it's a standalone reaction, ensure it's in the allowed 3-repeat triplet format.
      const allowedTriplets = ['😭😭😭', '❤️❤️❤️', '💀💀💀', '💔💔💔', '😂😂😂'];
      let hasAllowedTriplet = false;
      for (const t of allowedTriplets) {
        if (reply.includes(t)) {
          hasAllowedTriplet = true;
          break;
        }
      }
      if (!hasAllowedTriplet) {
        reply = reply.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').replace(/\s{2,}/g, ' ').trim();
      }

      return reply;
    } catch (err) {
      console.error('❌ Azure OpenAI generation error:', err.message);
      throw err;
    }
  }

  /**
   * Business reply: professional brand voice driven by business CEL directives (hours, escalation, refunds, discounts)
   */
  async generateBusinessReply({ userMemory, messageHistory, incomingText, config, tenant }) {
    const policy = config.businessPolicy || {};
    const business = tenant?.businessProfile || {};
    const businessName = business.businessName || config.creatorName || 'our business';

    const decision = celRuleEngine.evaluateForTenant({
      accountType: 'business',
      userMemory,
      incomingText,
      businessConfig: { ...config, businessName, businessCategory: business.category },
      customRules: policy.customRules || [],
    });
    const { directives, selectedModel, chatType } = decision;
    console.log(`🏢 [Business Routing]: "${selectedModel}" for chatType "${chatType}"`);

    const systemPrompt = `You are the customer messaging assistant for ${businessName}${business.category ? ` (${business.category})` : ''}, replying to customers in Instagram Direct Messages on behalf of the team.

ABOUT THE BUSINESS:
${business.description || config.aboutMe || config.personaBio || '(no description provided)'}

${config.customKnowledge ? `PRODUCTS, SERVICES & FAQ (THE ONLY SOURCE OF FACTS):\n${config.customKnowledge}\n` : ''}
${config.toneGuidelines ? `BRAND VOICE:\n${config.toneGuidelines}\n` : ''}
BUSINESS HOURS: ${policy.openTime || '09:00'}-${policy.closeTime || '18:00'} (${policy.timezone || 'Asia/Kolkata'}).

ACTIVE BUSINESS POLICY DIRECTIVES FOR THIS MESSAGE:
${directives.policyDirectives.length ? directives.policyDirectives.map(d => `- ${d}`).join('\n') : '- Answer the customer helpfully using only the information above.'}
${directives.customDirectives.length ? directives.customDirectives.map(d => `- ${d}`).join('\n') : ''}

RESPONSE RULES:
${directives.rules.map(r => `- ${r}`).join('\n')}
- If you do not know the answer, say a team member will confirm and follow up. Never guess.
${(config.forbiddenWords && config.forbiddenWords.length > 0) ? `- NEVER SAY: ${config.forbiddenWords.map(w => `"${w}"`).join(', ')}` : ''}

CUSTOMER:
- Name: ${userMemory.name || userMemory.username || 'Customer'}
- Previous messages: ${userMemory.messageCount || 0}
- Conversation summary: ${userMemory.rollingSummary || 'New conversation'}

Only return the message text. No quotation marks, no name prefix, no attachment tags.`;

    const messages = [{ role: 'system', content: systemPrompt }];
    const history = (messageHistory && messageHistory.length > 0)
      ? messageHistory
      : (userMemory.recentChatBuffer || []).map(b => ({ role: b.role, text: b.text }));
    for (const msg of history || []) {
      if (!msg.text) continue;
      if (msg.role === 'user' && msg.text.trim() === incomingText.trim()) continue;
      messages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.text });
    }
    messages.push({ role: 'user', content: incomingText });

    let client = this.getClient(selectedModel);
    let response;
    try {
      response = await client.chat.completions.create({
        messages,
        ...(selectedModel.startsWith('gpt-5') ? { max_completion_tokens: 300 } : { max_tokens: 300, temperature: 0.4 }),
      });
    } catch (modelErr) {
      console.warn(`⚠️ [Model Fallback]: Model "${selectedModel}" failed (${modelErr.message}). Falling back to "gpt-4o"...`);
      client = this.getClient('gpt-4o');
      response = await client.chat.completions.create({ messages, temperature: 0.4, max_tokens: 300 });
    }

    // Strip quotes, name prefixes and any sticker/attachment tags (never sent for business)
    return (response.choices[0].message.content || '')
      .trim()
      .replace(/^"|"$/g, '')
      .replace(new RegExp(`^${businessName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`), '')
      .replace(/\[(?:STICKER|ATTACHMENT):\s*[a-zA-Z0-9_-]+\]/gi, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  /**
   * Generates a natural, friendly follow-up check-in when a conversation has been inactive for 5-6 hours
   */
  async generateFollowUpReminder({ userMemory, messageHistory }) {
    let config = await redisService.getCachedPersonaConfig();
    if (!config) {
      config = await PersonaConfig.findOne();
      if (!config) {
        config = await PersonaConfig.create({});
      }
      await redisService.cachePersonaConfig(config.toObject ? config.toObject() : config, 600);
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
      const client = this.getClient('gpt-5.1-chat');
      const response = await client.chat.completions.create({
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
    const SocialGraph = require('../models/SocialGraph');
    let dbCircleSummary = '';
    try {
      const allDbNodes = await SocialGraph.find({}).limit(50);
      dbCircleSummary = allDbNodes.map(n => `- ${n.name} (${n.instagramHandle || 'no handle'}) - ${n.relationshipToSam || 'Friend'}: ${(n.lore || []).slice(0, 2).join('; ')}`).join('\n');
    } catch (e) {}

    const systemPrompt = `You are Sam Joshua's intelligent Social Knowledge Graph Architect with DIRECT DATABASE CONTROL & EDITING AUTHORITY.
Sam is adding, updating, or merging people in his personal Instagram circle knowledge graph and live MongoDB database.
You possess direct write, edit, and delete permissions to the database.

CURRENT LIVE CIRCLE IN DATABASE (FETCHED DIRECTLY FROM MONGODB):
${dbCircleSummary || '(Zero hardcoded entries — fetched live from MongoDB)'}

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
      const client = this.getClient('gpt-5.6-luna');
      const response = await client.chat.completions.create({
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
      const client = this.getClient('gpt-5.6-luna');
      const response = await client.chat.completions.create({
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
