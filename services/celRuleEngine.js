const { evaluate } = require('@marcbachmann/cel-js');

class CelRuleEngine {
  constructor() {
    // Declarative CEL rules for deterministic style routing
    this.STYLE_MODE_RULE = `
      message.hasTamilSlang || user.language == 'tamil' ? 'tanglish_homie' :
      user.gender == 'female' && (user.relationshipType == 'friend' || user.relationshipType == 'fan') ? 'sweet_playful' :
      user.gender == 'male' && user.relationshipType == 'friend' ? 'guy_banter' :
      user.relationshipType == 'collaborator' || user.relationshipType == 'client' ? 'chill_creator' :
      'casual_peer'
    `;

    this.FACT_GATING_RULE = `
      message.isAskingAboutMemory || message.isPersonalQuestion || message.isFollowUpContext
    `;

    this.LENGTH_TIER_RULE = `
      message.isReelShare || message.wordCount <= 3 ? 'ultra_short' :
      message.wordCount <= 10 ? 'one_liner' :
      'short_burst'
    `;

    // Hardcoded model routing based on chat type
    this.MODEL_ROUTING_RULE = `
      message.isCollabOrTech || message.isEmotional || message.isAskingAboutMemory || message.wordCount >= 16 ? 'gpt-5.6-luna' :
      'gpt-5.1-chat'
    `;
  }

  /**
   * Pre-processes raw inputs into typed context for CEL evaluation
   */
  buildContext({ userMemory, incomingText, isReelShare = false }) {
    const text = (incomingText || '').trim();
    const lower = text.toLowerCase();
    const words = text.split(/\s+/).filter(Boolean);

    // Detect Tamil / Tanglish slang tokens
    const tamilTokens = [
      'dei', 'da', 'machi', 'machan', 'seri', 'apdiya', 'loosu', 'enna da', 'ennada',
      'thala', 'podhum', 'paravala', 'marandhutiya', 'apram', 'vishayam', 'vela paaru',
      'semma', 'vera level', 'sari vidu', 'aama', 'illada', 'solra', 'solu', 'poda',
      'vaa da', 'vanakam', 'vanakkam', 'machii', 'thalaiva'
    ];
    const hasTamilSlang = tamilTokens.some(tok => new RegExp(`\\b${tok}\\b`, 'i').test(lower));

    // Detect if user is explicitly asking about their remembered lore or personal profile
    const memoryKeywords = [
      'do you remember', 'remember when', 'my bday', 'my birthday', 'my age',
      'where do i study', 'my college', 'my school', 'my favorite', 'what do i like',
      'who am i', 'what is my name', 'do u remember', 'remind me', 'you know me'
    ];
    const isAskingAboutMemory = memoryKeywords.some(kw => lower.includes(kw));

    const isCollabOrTech = /collab|portfolio|project|edit|editing|premiere|after effects|motion graphics|camera|hire|work with you|rates|business|inquiry/i.test(lower);
    const isEmotional = /sad|depressed|heartbroken|problem|advice|stress|anxiety|crying|hurting|grief|feel lonely|breakup|fail/i.test(lower);
    const conversationStyle = userMemory?.conversationStyle || 'Casual';
    const roastStyle = userMemory?.roastStyle || '';
    const personalNotes = userMemory?.personalNotes || '';
    const tonePreference = userMemory?.tonePreference || '';
    const messageCount = userMemory?.messageCount || 0;
    const isLongTermContact = messageCount >= 8;

    // Check if MongoDB already learned Tanglish/Tamil for this contact over their chat history
    const isLearnedTamil = /tamil|tanglish/i.test(conversationStyle) ||
                           /tamil|tanglish/i.test(personalNotes) ||
                           /tamil|tanglish/i.test(roastStyle) ||
                           /tamil|tanglish/i.test(tonePreference);

    const isTamilLanguage = hasTamilSlang || isLearnedTamil;

    const isPersonalQuestion = /\b(what|where|who|when|how)\b/i.test(lower) && /\b(i|my|we|me)\b/i.test(lower);
    const isFollowUpContext = (userMemory?.facts || []).length > 0 && isAskingAboutMemory;

    return {
      user: {
        name: userMemory?.name || '',
        nickname: userMemory?.nickname || '',
        gender: userMemory?.gender || 'unknown',
        relationshipType: userMemory?.relationshipType || 'stranger',
        conversationStyle,
        roastStyle,
        personalNotes,
        tonePreference,
        messageCount,
        isLongTermContact,
        isLearnedTamil,
        language: isTamilLanguage ? 'tamil' : 'english',
        hasFacts: (userMemory?.facts || []).length > 0,
      },
      message: {
        raw: text,
        wordCount: words.length,
        hasTamilSlang,
        isReelShare,
        isAskingAboutMemory,
        isCollabOrTech,
        isEmotional,
        isPersonalQuestion,
        isFollowUpContext,
      }
    };
  }

  /**
   * Evaluates CEL rules and returns dynamic style directives and model routing
   */
  evaluate({ userMemory, incomingText, isReelShare = false }) {
    const context = this.buildContext({ userMemory, incomingText, isReelShare });

    let styleMode = 'casual_peer';
    let shouldInjectFacts = false;
    let lengthTier = 'one_liner';
    let selectedModel = 'gpt-5.1-chat';
    let chatType = 'fast_casual_dm';

    try {
      styleMode = evaluate(this.STYLE_MODE_RULE, context);
      shouldInjectFacts = evaluate(this.FACT_GATING_RULE, context);
      lengthTier = evaluate(this.LENGTH_TIER_RULE, context);
      selectedModel = evaluate(this.MODEL_ROUTING_RULE, context);
    } catch (err) {
      console.warn('⚠️ [CEL Engine Fallback]:', err.message);
      if (context.message.hasTamilSlang) styleMode = 'tanglish_homie';
      else if (context.user.gender === 'female') styleMode = 'sweet_playful';
      shouldInjectFacts = context.message.isAskingAboutMemory;
      selectedModel = (context.message.isCollabOrTech || context.message.isEmotional || context.message.isAskingAboutMemory || context.message.wordCount >= 16)
        ? 'gpt-5.6-luna'
        : 'gpt-5.1-chat';
    }

    if (context.message.isCollabOrTech) chatType = 'creative_collab_tech';
    else if (context.message.isEmotional) chatType = 'emotional_support';
    else if (context.message.isAskingAboutMemory) chatType = 'lore_memory_recall';
    else if (context.message.isReelShare) chatType = 'reel_reaction';
    else if (context.message.wordCount >= 16) chatType = 'deep_discussion';
    else chatType = 'fast_casual_dm';

    // Directives tailored to the evaluated styleMode
    const directives = this.getDirectivesForMode(styleMode, lengthTier, shouldInjectFacts, context);

    return {
      styleMode,
      shouldInjectFacts,
      lengthTier,
      selectedModel,
      chatType,
      directives,
      context,
    };
  }

  getDirectivesForMode(styleMode, lengthTier, shouldInjectFacts, context) {
    let modeInstruction = '';

    switch (styleMode) {
      case 'tanglish_homie':
        modeInstruction = `STYLE: TANGLISH HOMIE BANTER
- Text in casual conversational Tanglish phonetics (e.g. "dei", "enna da", "seri seri", "apdiya da", "semma bro", "vera level", "paravala da").
- Be witty, brotherly, teasing, and authentic. Never use stale repetitive cuss words.`;
        break;

      case 'sweet_playful':
        modeInstruction = `STYLE: SWEET & GENTLE (FEMALE FRIEND)
- Speak warmly with sweet, cheerful, and gentle teasing.
- CRITICAL: NEVER call her "bro", "da", "machan", or "man". Use her name, nickname, or neutral terms.
- Supportive, playful, and genuine vibes.`;
        break;

      case 'guy_banter':
        modeInstruction = `STYLE: GUY HOMIE BANTER
- Chill witty banter, quick jokes, friendly teasing.
- Match their slang and energy. Keep it funny and lively.`;
        break;

      case 'chill_creator':
        modeInstruction = `STYLE: CHILL CONTENT CREATOR
- Enthusiastic about video editing, tech, creative ideas, reels, collaborations.
- Humble, approachable, concise, hype them up.`;
        break;

      case 'casual_peer':
      default:
        modeInstruction = `STYLE: CASUAL PEER & FRIEND
- Casual, authentic Instagram texting like a real human.
- Zero corporate or AI politeness. Welcoming, chill, and relatable.`;
        break;
    }

    let lengthInstruction = '';
    if (lengthTier === 'ultra_short') {
      lengthInstruction = `LENGTH: 1 ultra-short burst (e.g. 1-4 words or an emoji reaction).`;
    } else if (lengthTier === 'one_liner') {
      lengthInstruction = `LENGTH: Exactly 1 short, punchy sentence. Real people on DMs don't write paragraphs.`;
    } else {
      lengthInstruction = `LENGTH: Max 1 to 2 short lines. Quick human reply.`;
    }

    let learnedStyleDirective = '';
    if (context.user.conversationStyle && context.user.conversationStyle !== 'Casual' && context.user.conversationStyle !== 'Casual & friendly') {
      learnedStyleDirective += `\nMONGODB LEARNED TEXTING STYLE (FROM 1-MONTH CHAT HISTORY): ${context.user.conversationStyle} (mirror this energy).`;
    }
    if (context.user.roastStyle) {
      learnedStyleDirective += `\nMONGODB LEARNED BANTER / ROAST STYLE: ${context.user.roastStyle}`;
    }
    if (context.user.personalNotes) {
      learnedStyleDirective += `\nMONGODB LEARNED PERSON LORE: ${context.user.personalNotes}`;
    }
    if (context.user.isLongTermContact) {
      learnedStyleDirective += `\nRELATIONSHIP DEPTH: You have an established 1-month conversation history (${context.user.messageCount} messages). Speak with close-friend familiarity.`;
    }

    if (learnedStyleDirective) {
      modeInstruction += `\n${learnedStyleDirective}`;
    }

    let factInstruction = '';
    if (shouldInjectFacts) {
      factInstruction = `MEMORY RECALL DIRECTIVE:
- The user is asking about or referencing something you know about them.
- Naturally mention the remembered fact casually like a human friend who just remembered, NEVER like a database or assistant reading notes.`;
    } else {
      factInstruction = `ANTI-DOSSIER / ZERO FACT-DUMPING RULE (STRICT):
- The user is having a normal chat. DO NOT unprompted list their facts, birthday, favorites, or notes.
- Act like you already know them without having to prove it by dumping data. Focus on their immediate message.`;
    }

    return {
      modeInstruction,
      lengthInstruction,
      factInstruction,
      rules: [
        'ALL LOWERCASE: real Instagram DMs are casual lowercase.',
        'NO FORMAL PUNCTUATION: never end messages with a period (.), semicolons, or stiff grammar.',
        'CASUAL SHORTCUTS: use u, rn, fr, tbh, idk, wbu, haha, lol, yo, ngl naturally.',
        'ZERO AI TALK: strictly forbidden to say "how can i help you", "as an ai", "certainly", "hope this helps".',
      ]
    };
  }
}

module.exports = new CelRuleEngine();
