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

    // ── Business rules (never evaluated for personal accounts) ──
    this.BUSINESS_HOURS_RULE = `
      policy.openMinutes <= policy.closeMinutes
        ? clock.isWorkingDay && clock.minutes >= policy.openMinutes && clock.minutes < policy.closeMinutes
        : clock.isWorkingDay && (clock.minutes >= policy.openMinutes || clock.minutes < policy.closeMinutes)
    `;

    this.BUSINESS_ESCALATION_RULE = `
      message.isComplaint || message.asksForHuman
    `;

    this.BUSINESS_REFUND_RULE = `
      !message.mentionsRefund ? 'none' :
      policy.hasRefundPolicy ? 'quote_policy' :
      'defer_to_human'
    `;

    this.BUSINESS_DISCOUNT_RULE = `
      !message.asksForDiscount ? 'none' :
      policy.allowDiscounts && policy.hasDiscountPolicy ? 'quote_policy' :
      'decline_politely'
    `;

    this.BUSINESS_MODEL_ROUTING_RULE = `
      message.isComplaint || message.mentionsRefund || message.wordCount >= 25 ? 'gpt-5.6-luna' :
      'gpt-5.1-chat'
    `;
  }

  /**
   * 'business' and 'agency' tenants use business rules; 'personal' and 'creator' use personal rules
   */
  isBusinessAccount(accountType) {
    return accountType === 'business' || accountType === 'agency';
  }

  /**
   * Appends directives from tenant-defined rules: [{ when: '<CEL expression>', directive: '<text>' }]
   */
  applyCustomRules(context, customRules = []) {
    const extra = [];
    for (const rule of customRules || []) {
      if (!rule || !rule.when || !rule.directive) continue;
      try {
        if (evaluate(rule.when, context) === true) extra.push(rule.directive);
      } catch (err) {
        console.warn(`⚠️ [CEL Custom Rule Skipped] "${rule.when}": ${err.message}`);
      }
    }
    return extra;
  }

  /**
   * Single entry point: routes to the personal or business evaluator by tenant account type
   */
  evaluateForTenant({ accountType, userMemory, incomingText, isReelShare = false, businessConfig = null, customRules = [] }) {
    if (this.isBusinessAccount(accountType)) {
      const context = this.buildBusinessContext({ businessConfig, customerMemory: userMemory, incomingText });
      return this.evaluateBusiness(context, customRules);
    }
    const context = this.buildPersonalContext({ userMemory, incomingText, isReelShare });
    return this.evaluatePersonal(context, customRules);
  }

  // Backwards-compatible alias
  buildContext(args) {
    return this.buildPersonalContext(args);
  }

  /**
   * Pre-processes raw inputs into typed context for personal CEL evaluation
   */
  buildPersonalContext({ userMemory, incomingText, isReelShare = false }) {
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
   * Personal evaluation from raw inputs (kept for existing callers)
   */
  evaluate({ userMemory, incomingText, isReelShare = false }) {
    return this.evaluatePersonal(this.buildPersonalContext({ userMemory, incomingText, isReelShare }));
  }

  /**
   * Evaluates personal CEL rules and returns style directives and model routing
   */
  evaluatePersonal(context, customRules = []) {
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
    directives.customDirectives = this.applyCustomRules(context, customRules);

    return {
      accountKind: 'personal',
      styleMode,
      shouldInjectFacts,
      lengthTier,
      selectedModel,
      chatType,
      directives,
      context,
      allowStickers: true,
      autoReactReel: true,
    };
  }

  /**
   * Pre-processes raw inputs into typed context for business CEL evaluation
   */
  buildBusinessContext({ businessConfig, customerMemory, incomingText, now = new Date() }) {
    const policy = businessConfig?.businessPolicy || {};
    const text = (incomingText || '').trim();
    const lower = text.toLowerCase();
    const words = text.split(/\s+/).filter(Boolean);

    const defaultEscalation = [
      'complaint', 'complain', 'scam', 'fraud', 'cheated', 'worst', 'terrible', 'disappointed',
      'angry', 'unacceptable', 'manager', 'human', 'real person', 'speak to someone', 'talk to someone',
      'customer care', 'legal', 'lawyer', 'consumer court', 'not working', 'broken', 'damaged', 'never arrived',
    ];
    const escalationWords = [...defaultEscalation, ...(policy.escalationKeywords || [])].map(w => String(w).toLowerCase()).filter(Boolean);
    const matchedEscalation = escalationWords.find(w => lower.includes(w)) || '';
    const asksForHuman = /\b(human|real person|agent|manager|someone from your team|call me)\b/i.test(lower);

    const toMinutes = (hhmm, fallback) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
      return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
    };
    const timezone = policy.timezone || 'Asia/Kolkata';
    let weekday = now.getDay();
    let minutes = now.getHours() * 60 + now.getMinutes();
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
      const get = (t) => parts.find(p => p.type === t)?.value;
      weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
      minutes = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
    } catch (_) {}
    const workingDays = policy.workingDays && policy.workingDays.length ? policy.workingDays : [1, 2, 3, 4, 5, 6];

    return {
      business: {
        name: businessConfig?.businessName || businessConfig?.creatorName || '',
        category: businessConfig?.businessCategory || '',
      },
      policy: {
        timezone,
        openMinutes: toMinutes(policy.openTime, 9 * 60),
        closeMinutes: toMinutes(policy.closeTime, 18 * 60),
        hasRefundPolicy: Boolean((policy.refundPolicy || '').trim()),
        allowDiscounts: Boolean(policy.allowDiscounts),
        hasDiscountPolicy: Boolean((policy.discountPolicy || '').trim()),
        refundPolicy: policy.refundPolicy || '',
        discountPolicy: policy.discountPolicy || '',
        outOfHoursMessage: policy.outOfHoursMessage || '',
        openTime: policy.openTime || '09:00',
        closeTime: policy.closeTime || '18:00',
      },
      clock: {
        weekday,
        minutes,
        isWorkingDay: workingDays.includes(weekday),
      },
      customer: {
        name: customerMemory?.name || customerMemory?.username || '',
        messageCount: customerMemory?.messageCount || 0,
        isReturning: (customerMemory?.messageCount || 0) >= 3,
        handoffPending: Boolean(customerMemory?.handoffRequestedAt),
      },
      message: {
        raw: text,
        wordCount: words.length,
        isComplaint: Boolean(matchedEscalation) && !/\b(no complaints?|not complaining)\b/i.test(lower),
        matchedEscalation,
        asksForHuman,
        mentionsRefund: /\b(refund|money back|return (it|this|my)|chargeback|cancel (my )?order)\b/i.test(lower),
        asksForDiscount: /\b(discount|coupon|promo|offer|cheaper|best price|price drop|deal)\b/i.test(lower),
        isQuestion: /\?|^(what|how|when|where|do|does|can|is|are)\b/i.test(lower),
      },
    };
  }

  /**
   * Evaluates business CEL rules: hours, escalation and refund/discount gates
   */
  evaluateBusiness(context, customRules = []) {
    let isWithinBusinessHours = true;
    let shouldEscalate = false;
    let refundAction = 'none';
    let discountAction = 'none';
    let selectedModel = 'gpt-5.1-chat';

    try {
      isWithinBusinessHours = evaluate(this.BUSINESS_HOURS_RULE, context);
      shouldEscalate = evaluate(this.BUSINESS_ESCALATION_RULE, context);
      refundAction = evaluate(this.BUSINESS_REFUND_RULE, context);
      discountAction = evaluate(this.BUSINESS_DISCOUNT_RULE, context);
      selectedModel = evaluate(this.BUSINESS_MODEL_ROUTING_RULE, context);
    } catch (err) {
      console.warn('⚠️ [CEL Business Fallback]:', err.message);
      const { message, policy } = context;
      shouldEscalate = message.isComplaint || message.asksForHuman;
      refundAction = !message.mentionsRefund ? 'none' : (policy.hasRefundPolicy ? 'quote_policy' : 'defer_to_human');
      discountAction = !message.asksForDiscount ? 'none' : (policy.allowDiscounts && policy.hasDiscountPolicy ? 'quote_policy' : 'decline_politely');
      selectedModel = (message.isComplaint || message.mentionsRefund || message.wordCount >= 25) ? 'gpt-5.6-luna' : 'gpt-5.1-chat';
    }
    if (refundAction === 'defer_to_human') shouldEscalate = true;

    let chatType = 'customer_inquiry';
    if (shouldEscalate) chatType = 'escalation';
    else if (refundAction !== 'none') chatType = 'refund_request';
    else if (discountAction !== 'none') chatType = 'pricing_discount';
    else if (!isWithinBusinessHours) chatType = 'after_hours';

    const { policy } = context;
    const policyDirectives = [];
    if (!isWithinBusinessHours) {
      policyDirectives.push(policy.outOfHoursMessage
        ? `AFTER HOURS: We are currently closed (hours ${policy.openTime}-${policy.closeTime}, ${policy.timezone}). Convey this message: "${policy.outOfHoursMessage}"`
        : `AFTER HOURS: We are currently closed (hours ${policy.openTime}-${policy.closeTime}, ${policy.timezone}). Answer simple questions, and say the team will follow up when we reopen.`);
    }
    if (shouldEscalate) {
      policyDirectives.push('ESCALATION: Acknowledge the concern with empathy, apologise once, and confirm a team member will personally follow up. Do not argue, promise compensation, or make commitments.');
    }
    if (refundAction === 'quote_policy') {
      policyDirectives.push(`REFUNDS: Follow only this refund policy, word for word where possible: "${policy.refundPolicy}". Never promise anything beyond it.`);
    } else if (refundAction === 'defer_to_human') {
      policyDirectives.push('REFUNDS: Do not approve, deny or estimate refunds. Say the team will review the request and get back to them.');
    }
    if (discountAction === 'quote_policy') {
      policyDirectives.push(`DISCOUNTS: Only offer what this policy allows: "${policy.discountPolicy}". Never invent codes or percentages.`);
    } else if (discountAction === 'decline_politely') {
      policyDirectives.push('DISCOUNTS: Politely say there are no discounts available right now. Never invent codes, offers or percentages.');
    }

    return {
      accountKind: 'business',
      isWithinBusinessHours,
      shouldEscalate,
      refundAction,
      discountAction,
      selectedModel,
      chatType,
      directives: {
        policyDirectives,
        customDirectives: this.applyCustomRules(context, customRules),
        rules: [
          'PROFESSIONAL BRAND VOICE: clear, friendly and helpful; standard capitalization and punctuation.',
          'NO SLANG OR BANTER: never use rn, fr, tbh, lol, bro, da, machan or teasing.',
          'NO EMOJI SPAM: at most one tasteful emoji, and none in complaints or refunds.',
          'NEVER INVENT FACTS: prices, stock, policies and timelines come only from the business information provided.',
          'CONCISE: 1 to 3 short sentences unless the customer asks for detail.',
        ],
      },
      context,
      allowStickers: false,
      autoReactReel: false,
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
