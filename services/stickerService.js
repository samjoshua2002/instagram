

const MediaVault = require('../models/MediaVault');
const PersonaConfig = require('../models/PersonaConfig');

/**
 * Dynamic Media Vault & Reaction GIF Service
 * Prioritizes user-uploaded images/GIFs from MediaVault across emotional categories,
 * with fallback to curated funny reaction GIFs/memes.
 */
class StickerService {
  constructor() {
    this.stickers = {};
    this.defaultCategories = [
      { id: 'joy', label: 'Joy / Haha', description: 'Laughing, smiling, happy reactions' },
      { id: 'lol', label: 'LOL / ROFL', description: 'Dying laughing, hilarious memes, skull' },
      { id: 'wonder', label: 'Wonder / Shock', description: 'Mind blown, amazed, shocked, wow' },
      { id: 'sad', label: 'Sad / Crying', description: 'Tears, dramatic crying, heartbreak' },
      { id: 'happy', label: 'Happy / Hype', description: 'Cheering, celebrating, dancing, love' },
      { id: 'side_eye', label: 'Side Eye / Sus', description: 'Sarcasm, bombastic side eye, judging' },
      { id: 'confused', label: 'Confused / IDK', description: 'What, Travolta, question marks, lost' },
      { id: 'cool', label: 'Cool / High Five', description: 'Chill vibes, thumbs up, sunglasses' },
    ];
    this.initCatalog();
    this.initPredefinedList();
  }

  initPredefinedList() {
    this.predefinedGifs = [
      // SIDE EYE / SUS
      {
        id: 'pred_side_eye_chloe',
        name: 'Chloe Bombastic Side Eye',
        category: 'side_eye',
        url: 'https://media.giphy.com/media/H5C8CevNMbpBqNqFjl/giphy.gif',
        keywords: ['sus', 'side eye', 'doubt', 'ai', 'robot', 'judging', 'fake', 'chloe', 'skeptical', 'suspicious'],
        mediaType: 'gif'
      },
      {
        id: 'pred_side_eye_dog',
        name: 'Dog Bombastic Side Eye',
        category: 'side_eye',
        url: 'https://media.giphy.com/media/ANbD1CCdA3iI8/giphy.gif',
        keywords: ['sus', 'dog', 'squint', 'doubt', 'ai', 'side eye', 'bombastic', 'judging'],
        mediaType: 'gif'
      },
      {
        id: 'pred_side_eye_monkey',
        name: 'Awkward Monkey Puppet Look Away',
        category: 'side_eye',
        url: 'https://media.giphy.com/media/cJMlRUCbMMzpC/giphy.gif',
        keywords: ['awkward', 'puppet', 'sus', 'guilty', 'look away', 'ai', 'oops'],
        mediaType: 'gif'
      },
      {
        id: 'pred_side_eye_rock',
        name: 'The Rock Eyebrow Raise Boom',
        category: 'side_eye',
        url: 'https://media.giphy.com/media/26ghbWoXv3G6ypo8o/giphy.gif',
        keywords: ['the rock', 'eyebrow', 'sus', 'vine boom', 'judging', 'doubt', 'ai'],
        mediaType: 'gif'
      },

      // JOY / LAUGH / HAHA
      {
        id: 'pred_joy_leo_django',
        name: 'Leonardo DiCaprio Laughing Cheers',
        category: 'joy',
        url: 'https://media.giphy.com/media/WpaVhEcp3nnBAj2LAc/giphy.gif',
        keywords: ['leo', 'leonardo', 'laugh', 'haha', 'drink', 'cheers', 'smug', 'funny', 'joy'],
        mediaType: 'gif'
      },
      {
        id: 'pred_joy_minion',
        name: 'Wheezing Laugh',
        category: 'joy',
        url: 'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif',
        keywords: ['laugh', 'wheeze', 'haha', 'funny', 'joy', 'chuckle'],
        mediaType: 'gif'
      },
      {
        id: 'pred_joy_shaq',
        name: 'Shaq Shimmy Laugh',
        category: 'joy',
        url: 'https://media.giphy.com/media/UO5elnTqo4vSg/giphy.gif',
        keywords: ['shaq', 'shimmy', 'laugh', 'giggle', 'joy', 'vibing'],
        mediaType: 'gif'
      },

      // LOL / ROFL / SKULL
      {
        id: 'pred_lol_skull',
        name: 'Dying Laughing Tears',
        category: 'lol',
        url: 'https://media.giphy.com/media/vjjCsx3izfRSq4Ze05/giphy.gif',
        keywords: ['lol', 'dead', 'skull', 'dying', 'lmao', 'rofl', 'crying laughing'],
        mediaType: 'gif'
      },
      {
        id: 'pred_lol_risitas',
        name: 'El Risitas Wheezing KEKW',
        category: 'lol',
        url: 'https://media.giphy.com/media/j9mqKgQvkNOziGICfd/giphy.gif',
        keywords: ['risitas', 'kekw', 'lol', 'wheezing', 'hysterical', 'lmao'],
        mediaType: 'gif'
      },
      {
        id: 'pred_lol_gosling',
        name: 'Ryan Gosling Giggle',
        category: 'lol',
        url: 'https://media.giphy.com/media/oubM1tKqnLW5G/giphy.gif',
        keywords: ['gosling', 'ryan gosling', 'giggle', 'lol', 'smile', 'chuckle'],
        mediaType: 'gif'
      },

      // WONDER / SHOCK / MIND BLOWN
      {
        id: 'pred_wonder_mind_blown',
        name: 'Mind Blown Space Explosion',
        category: 'wonder',
        url: 'https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif',
        keywords: ['mind blown', 'explosion', 'shock', 'wonder', 'insane', 'galaxy', 'universe', 'wow'],
        mediaType: 'gif'
      },
      {
        id: 'pred_wonder_chris_pratt',
        name: 'Chris Pratt Surprised Gasp',
        category: 'wonder',
        url: 'https://media.giphy.com/media/5VKbvrjxpVJCM/giphy.gif',
        keywords: ['chris pratt', 'shocked', 'gasp', 'omg', 'excited', 'wow', 'parks and rec'],
        mediaType: 'gif'
      },
      {
        id: 'pred_wonder_jonah_hill',
        name: 'Jonah Hill Screaming Excitement',
        category: 'wonder',
        url: 'https://media.giphy.com/media/5mBE2MiMVFITS/giphy.gif',
        keywords: ['jonah hill', 'screaming', 'omg', 'shock', 'excited', 'flabbergasted', 'wild'],
        mediaType: 'gif'
      },

      // SAD / CRYING
      {
        id: 'pred_sad_crying_stream',
        name: 'Dramatic Tears Waterfall',
        category: 'sad',
        url: 'https://media.giphy.com/media/L95W4wv8nnb9K/giphy.gif',
        keywords: ['sad', 'crying', 'tears', 'waterfall', 'heartbroken', 'pain', 'sobbing'],
        mediaType: 'gif'
      },
      {
        id: 'pred_sad_dawson',
        name: 'Dawson Ugly Cry',
        category: 'sad',
        url: 'https://media.giphy.com/media/OPU6wzx8JrHna/giphy.gif',
        keywords: ['dawson', 'ugly cry', 'sad', 'crying', 'sob', 'pain'],
        mediaType: 'gif'
      },
      {
        id: 'pred_sad_cat_thumbs_up',
        name: 'Cat Crying Thumbs Up ("I\'m Fine")',
        category: 'sad',
        url: 'https://media.giphy.com/media/9Y5BbDSkSTiY8/giphy.gif',
        keywords: ['cat crying', 'thumbs up', 'pain', 'fine', 'sad', 'im fine', 'crying meme'],
        mediaType: 'gif'
      },

      // HAPPY / HYPE
      {
        id: 'pred_happy_gatsby',
        name: 'Great Gatsby Cheers Toast',
        category: 'happy',
        url: 'https://media.giphy.com/media/GCLlQnV7dXZ2E/giphy.gif',
        keywords: ['gatsby', 'cheers', 'toast', 'celebrate', 'happy', 'fireworks', 'champagne'],
        mediaType: 'gif'
      },
      {
        id: 'pred_happy_snoopy',
        name: 'Snoopy Happy Dance',
        category: 'happy',
        url: 'https://media.giphy.com/media/nrXif9YExO9EI/giphy.gif',
        keywords: ['snoopy', 'dance', 'happy', 'hype', 'celebrating', 'dancing'],
        mediaType: 'gif'
      },
      {
        id: 'pred_happy_carlton',
        name: 'Carlton Dance Groove',
        category: 'happy',
        url: 'https://media.giphy.com/media/pa37AAGzKXoek/giphy.gif',
        keywords: ['carlton', 'dance', 'groove', 'hype', 'party', 'happy'],
        mediaType: 'gif'
      },
      {
        id: 'pred_happy_cheer',
        name: 'Kids Cheering High Five',
        category: 'happy',
        url: 'https://media.giphy.com/media/26BRv0ThflsDTjDUs/giphy.gif',
        keywords: ['cheer', 'yay', 'party', 'woohoo', 'hype', 'celebrate'],
        mediaType: 'gif'
      },

      // CONFUSED / IDK
      {
        id: 'pred_confused_travolta',
        name: 'John Travolta Looking Confused',
        category: 'confused',
        url: 'https://media.giphy.com/media/g01ZnwAUvutuK8GIQn/giphy.gif',
        keywords: ['travolta', 'confused', 'lost', 'where', 'what', 'idk', 'pulp fiction', 'looking around'],
        mediaType: 'gif'
      },
      {
        id: 'pred_confused_blinking',
        name: 'Blinking White Guy Disbelief',
        category: 'confused',
        url: 'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif',
        keywords: ['blinking', 'disbelief', 'drew scanlon', 'confused', 'what', 'huh', 'speechless'],
        mediaType: 'gif'
      },
      {
        id: 'pred_confused_math',
        name: 'Math Lady Calculating Confused',
        category: 'confused',
        url: 'https://media.giphy.com/media/4JVTF9fR99WYo/giphy.gif',
        keywords: ['math', 'calculating', 'confused', 'equations', 'what', 'thinking', 'huh'],
        mediaType: 'gif'
      },

      // COOL / CHILL / CATS
      {
        id: 'pred_cool_deal_with_it',
        name: 'Cat Deal With It Sunglasses',
        category: 'cool',
        url: 'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif',
        keywords: ['deal with it', 'sunglasses', 'cool', 'boss', 'cat', 'swagger'],
        mediaType: 'gif'
      },
      {
        id: 'pred_cool_thumbs_up',
        name: 'Thumbs Up Approval Kid',
        category: 'cool',
        url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif',
        keywords: ['thumbs up', 'nice', 'good job', 'approved', 'cool', 'solid'],
        mediaType: 'gif'
      },
      {
        id: 'pred_cool_vibing_cat',
        name: 'Vibing Cat Nodding Head',
        category: 'cool',
        url: 'https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif',
        keywords: ['cat', 'vibing', 'nodding', 'music', 'jamming', 'chill'],
        mediaType: 'gif'
      },
      {
        id: 'pred_cool_popcat',
        name: 'Popcat Opening Mouth',
        category: 'cool',
        url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
        keywords: ['popcat', 'pop cat', 'cat', 'mouth open', 'cute', 'meme'],
        mediaType: 'gif'
      }
    ];
  }

  getPredefinedList() {
    return this.predefinedGifs || [];
  }

  /**
   * Seeds predefined GIFs into MongoDB MediaVault collection.
   * Skips any items whose URL is already in the database.
   */
  async seedPredefinedIntoVault(selectedIds = null) {
    const list = this.getPredefinedList();
    const toImport = selectedIds && Array.isArray(selectedIds) && selectedIds.length > 0
      ? list.filter(item => selectedIds.includes(item.id))
      : list;

    const results = { added: 0, skipped: 0, items: [] };

    for (const item of toImport) {
      try {
        const existing = await MediaVault.findOne({ url: item.url });
        if (existing) {
          results.skipped++;
          continue;
        }

        const created = await MediaVault.create({
          name: item.name,
          category: item.category,
          url: item.url,
          mediaType: item.mediaType || 'gif',
          keywords: item.keywords || [],
          caption: `Predefined ${item.name}`,
        });
        results.added++;
        results.items.push(created);
      } catch (err) {
        console.warn(`Failed to seed predefined GIF ${item.name}:`, err.message);
      }
    }

    console.log(`📦 [Predefined Seed]: Added ${results.added} items, skipped ${results.skipped} existing items`);
    return results;
  }

  initCatalog() {
    this.stickers = {
      joy: [
        'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif',
        'https://media.giphy.com/media/WpaVhEcp3nnBAj2LAc/giphy.gif',
        'https://media.giphy.com/media/UO5elnTqo4vSg/giphy.gif',
      ],
      laugh: [
        'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif',
        'https://media.giphy.com/media/WpaVhEcp3nnBAj2LAc/giphy.gif',
      ],
      lol: [
        'https://media.giphy.com/media/vjjCsx3izfRSq4Ze05/giphy.gif',
        'https://media.giphy.com/media/j9mqKgQvkNOziGICfd/giphy.gif',
        'https://media.giphy.com/media/oubM1tKqnLW5G/giphy.gif',
      ],
      skull: [
        'https://media.giphy.com/media/vjjCsx3izfRSq4Ze05/giphy.gif',
      ],
      wonder: [
        'https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif',
        'https://media.giphy.com/media/5VKbvrjxpVJCM/giphy.gif',
        'https://media.giphy.com/media/5mBE2MiMVFITS/giphy.gif',
      ],
      shock: [
        'https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif',
        'https://media.giphy.com/media/5VKbvrjxpVJCM/giphy.gif',
      ],
      sad: [
        'https://media.giphy.com/media/L95W4wv8nnb9K/giphy.gif',
        'https://media.giphy.com/media/OPU6wzx8JrHna/giphy.gif',
        'https://media.giphy.com/media/9Y5BbDSkSTiY8/giphy.gif',
      ],
      crying: [
        'https://media.giphy.com/media/L95W4wv8nnb9K/giphy.gif',
        'https://media.giphy.com/media/OPU6wzx8JrHna/giphy.gif',
      ],
      happy: [
        'https://media.giphy.com/media/GCLlQnV7dXZ2E/giphy.gif',
        'https://media.giphy.com/media/nrXif9YExO9EI/giphy.gif',
        'https://media.giphy.com/media/pa37AAGzKXoek/giphy.gif',
        'https://media.giphy.com/media/26BRv0ThflsDTjDUs/giphy.gif',
      ],
      side_eye: [
        'https://media.giphy.com/media/H5C8CevNMbpBqNqFjl/giphy.gif',
        'https://media.giphy.com/media/ANbD1CCdA3iI8/giphy.gif',
        'https://media.giphy.com/media/cJMlRUCbMMzpC/giphy.gif',
        'https://media.giphy.com/media/26ghbWoXv3G6ypo8o/giphy.gif',
      ],
      confused: [
        'https://media.giphy.com/media/g01ZnwAUvutuK8GIQn/giphy.gif',
        'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif',
        'https://media.giphy.com/media/4JVTF9fR99WYo/giphy.gif',
      ],
      cool: [
        'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif',
        'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif',
        'https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif',
        'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
      ],
      cat: [
        'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif',
        'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
        'https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif',
      ],
    };
  }

  hasSticker(type) {
    if (!type) return false;
    const cleanType = type.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
    if (cleanType.includes('genshin') || cleanType.includes('paimon') || cleanType.includes('furina') || cleanType.includes('klee')) {
      return false;
    }
    return true;
  }

  /**
   * Retrieves image/GIF URL with smart semantic relevance matching.
   * Priority 1: User's saved media in MediaVault (scored by semantic keywords & context intent)
   * Priority 2: Predefined curated high-relevance GIFs
   * Priority 3: Direct live GIPHY search (if not rate limited)
   * Never returns an irrelevant random GIF. Returns null if no relevant match is found.
   */
  async getStickerUrl(type, contextText = '') {
    if (!type) return null;
    const cleanType = type.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');

    // Strictly reject any genshin / anime cartoon stickers
    if (cleanType.includes('genshin') || cleanType.includes('paimon') || cleanType.includes('furina') || cleanType.includes('klee')) {
      return null;
    }

    const lowerContext = (contextText || '').toLowerCase();

    // STRICT SAFETY CHECK:
    // If category is 'sad', ensure context has genuine sorrow/heartbreak.
    // NEVER send a sad GIF if user is discussing Furina, Genshin, anime, drama queens, or laughing!
    if (cleanType === 'sad') {
      const isFurinaOrAnime = /furina|genshin|fontaine|anime|archon|drama queen/.test(lowerContext);
      const isLaughing = /😂|💀|lol|lmao|rofl|haha|dead|dying/.test(lowerContext);
      const isGenuineSorrow = /heartbroken|depressed|so sad rn|crying inside|hurting|grief/.test(lowerContext);
      if (isFurinaOrAnime || isLaughing || !isGenuineSorrow) {
        console.log(`🛡️ [Sticker Filter]: Rejected 'sad' sticker for context: "${contextText.slice(0, 60)}" (not genuine sorrow)`);
        return null;
      }
    }

    // 1. FIRST PRIORITY: User's custom uploaded media in MongoDB MediaVault
    try {
      let allVaultItems = await MediaVault.find({});
      // Auto-seed predefined catalog if vault is empty
      if (!allVaultItems || allVaultItems.length === 0) {
        console.log(`📦 [MediaVault Auto-Seed]: Vault is empty. Auto-seeding curated meme collection into DB...`);
        await this.seedPredefinedIntoVault();
        allVaultItems = await MediaVault.find({});
      }

      const stopWords = new Set(['the', 'and', 'with', 'you', 'are', 'for', 'this', 'that', 'from', 'have', 'what', 'like', 'just', 'your', 'about', 'some', 'they', 'them', 'when', 'then', 'will', 'been', 'there', 'here', 'can', 'not', 'but', 'all', 'bro', 'man']);
      const contextWords = lowerContext
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));

      // Emotional cues detection
      const isLaughter = /lol|lmao|rofl|haha|dead|dying|wheeze|crying laughing|😂|💀/.test(lowerContext);
      const isSuspicion = /sus|bot|ai|robot|fake|doubt|skeptic|cheat|fishy/.test(lowerContext);
      const isShock = /shock|wow|omg|no way|mind blown|insane|wild|gasp/.test(lowerContext);
      const isConfused = /confus|what do you mean|lost|where|idk|huh\?/.test(lowerContext);
      const isHype = /hype|cheers|celebrate|party|fire|dance|groove|congrats/.test(lowerContext);
      const isCool = /cool|chill|cat|vibe|vibing|deal with it|smooth|thumbs up/.test(lowerContext);

      const scoredItems = [];

      for (const item of allVaultItems) {
        const itemCat = (item.category || '').toLowerCase();
        // Never evaluate sad items unless genuine sorrow
        if (itemCat === 'sad' && !/heartbroken|depressed|so sad rn|crying inside/.test(lowerContext)) {
          continue;
        }

        let score = 0;
        if (itemCat === cleanType) score += 12;

        // Semantic emotional intent boosters
        const itemKeywords = (item.keywords || []).map(k => (k || '').toLowerCase());
        const itemName = (item.name || '').toLowerCase();
        const itemCaption = (item.caption || '').toLowerCase();

        if (isLaughter && (itemCat === 'lol' || itemCat === 'joy' || itemKeywords.some(k => /laugh|kekw|wheez|skull|dying|lol/.test(k)))) score += 16;
        if (isSuspicion && (itemCat === 'side_eye' || itemKeywords.some(k => /sus|side eye|doubt|ai|bot|judg|rock|chloe/.test(k)))) score += 20;
        if (isShock && (itemCat === 'wonder' || itemKeywords.some(k => /shock|blown|omg|gasp|pratt/.test(k)))) score += 18;
        if (isConfused && (itemCat === 'confused' || itemKeywords.some(k => /confus|travolta|lost|blinking|math/.test(k)))) score += 18;
        if (isHype && (itemCat === 'happy' || itemKeywords.some(k => /cheers|dance|carlton|snoopy|gatsby/.test(k)))) score += 16;
        if (isCool && (itemCat === 'cool' || itemKeywords.some(k => /cool|cat|vibing|sunglasses|popcat/.test(k)))) score += 16;

        // Word-level matching
        for (const word of contextWords) {
          if (itemKeywords.includes(word)) score += 8;
          else if (itemKeywords.some(k => k.includes(word))) score += 4;
          if (itemName.includes(word)) score += 6;
          if (itemCaption.includes(word)) score += 4;
        }

        if (score > 0) {
          scoredItems.push({ item, score });
        }
      }

      scoredItems.sort((a, b) => b.score - a.score);

      // If we found relevant candidate matches in MediaVault, pick among top matches!
      if (scoredItems.length > 0 && scoredItems[0].score >= 12) {
        const topScore = scoredItems[0].score;
        // Take top items tied or within 5 points of top score for natural variety
        const topCandidates = scoredItems.filter(s => s.score >= topScore - 5).slice(0, 3);
        const picked = topCandidates[Math.floor(Math.random() * topCandidates.length)].item;
        console.log(`🎯 [MediaVault Relevant Match]: Picked "${picked.name}" [${picked.category}] (score: ${topScore}) for context: "${contextText.slice(0, 40)}..."`);
        return picked.url;
      }

      // If category items exist and no negative condition, pick the best category item
      const categoryMatches = allVaultItems.filter(item => (item.category || '').toLowerCase() === cleanType);
      if (categoryMatches.length > 0 && cleanType !== 'sad') {
        const picked = categoryMatches[Math.floor(Math.random() * categoryMatches.length)];
        console.log(`🎬 [MediaVault Category Match]: Picked "${picked.name}" [${picked.category}]`);
        return picked.url;
      }
    } catch (e) {
      console.warn('⚠️ MediaVault DB check error:', e.message);
    }

    // 2. SECOND PRIORITY: In-memory Predefined Curated GIFs (instant & relevant fallback)
    const predefinedList = this.getPredefinedList();
    const relevantPredefined = predefinedList.filter(item => {
      if (item.category === 'sad' && !/heartbroken|depressed|so sad rn/.test(lowerContext)) return false;
      return item.category === cleanType;
    });
    if (relevantPredefined.length > 0) {
      const picked = relevantPredefined[Math.floor(Math.random() * relevantPredefined.length)];
      console.log(`⚡ [Predefined Fallback Match]: Picked "${picked.name}" [${picked.category}]: ${picked.url}`);
      return picked.url;
    }

    // 3. THIRD PRIORITY: Direct live GIPHY API search (only if not rate-limited)
    if (!this.isGiphyRateLimited || Date.now() > this.rateLimitResetTime) {
      try {
        const liveGiphyUrl = await this.fetchFromGiphyApi(cleanType, contextText);
        if (liveGiphyUrl) return liveGiphyUrl;
      } catch (err) {
        console.warn('⚠️ Live Giphy API search failed, falling back:', err.message);
      }
    }

    // 3. THIRD PRIORITY: Built-in curated reaction GIF catalog fallback
    let list = this.stickers[cleanType];

    // Fuzzy matching for aliases
    if (!list || list.length === 0) {
      if (cleanType.includes('joy') || cleanType.includes('laugh') || cleanType.includes('haha') || cleanType.includes('lmao')) {
        list = this.stickers.joy;
      } else if (cleanType.includes('lol') || cleanType.includes('skull') || cleanType.includes('dead') || cleanType.includes('rofl')) {
        list = this.stickers.lol;
      } else if (cleanType.includes('wonder') || cleanType.includes('shock') || cleanType.includes('wow') || cleanType.includes('omg')) {
        list = this.stickers.wonder;
      } else if (cleanType.includes('sad') || cleanType.includes('cry') || cleanType.includes('tear')) {
        list = this.stickers.sad;
      } else if (cleanType.includes('happy') || cleanType.includes('hype') || cleanType.includes('fire')) {
        list = this.stickers.happy;
      } else if (cleanType.includes('side') || cleanType.includes('sus') || cleanType.includes('bombastic')) {
        list = this.stickers.side_eye;
      } else if (cleanType.includes('confus') || cleanType.includes('idk') || cleanType.includes('what')) {
        list = this.stickers.confused;
      } else if (cleanType.includes('cool') || cleanType.includes('cat') || cleanType.includes('chill')) {
        list = this.stickers.cool;
      } else {
        list = this.stickers.joy.concat(this.stickers.cat);
      }
    }

    if (!list || list.length === 0) return null;
    const idx = Math.floor(Math.random() * list.length);
    return list[idx];
  }

  /**
   * Queries GIPHY API live using the stored API key and context
   */
  async fetchFromGiphyApi(category, contextText = '') {
    try {
      const config = await PersonaConfig.findOne();
      const apiKey = (config && config.giphyApiKey) || process.env.GIPHY_API_KEY || 'qClDLN6qTZiRydbfmkuXgaenPeHIi9Q2';
      if (!apiKey) return null;

      // Extract trigger words from conversation context
      const lowerContext = (contextText || '').toLowerCase();
      const stopWords = ['the', 'and', 'with', 'you', 'are', 'for', 'this', 'that', 'what', 'like', 'send', 'just'];
      const words = lowerContext.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w));
      const contextSnippet = words.slice(0, 2).join(' ');

      let searchQuery = `${category.replace(/_/g, ' ')} reaction`;
      if (category === 'side_eye' || lowerContext.includes('sus') || lowerContext.includes('ai')) {
        searchQuery = 'side eye sus reaction';
      } else if (category === 'lol' || lowerContext.includes('dead') || lowerContext.includes('lmao')) {
        searchQuery = 'laughing dying meme reaction';
      } else if (category === 'confused' || lowerContext.includes('travolta') || lowerContext.includes('what')) {
        searchQuery = 'confused looking around reaction';
      } else if (contextSnippet) {
        searchQuery = `${category.replace(/_/g, ' ')} ${contextSnippet} reaction`;
      }

      const url = `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(searchQuery)}&limit=12&rating=pg-13`;
      const res = await fetch(url);
      if (res.status === 429) {
        this.isGiphyRateLimited = true;
        this.rateLimitResetTime = Date.now() + 3600000; // block for 1 hour
        console.warn('⚠️ [GIPHY 429 Rate Limit]: API rate limit exceeded. Automatically using saved MediaVault GIFs for 1 hour.');
        return null;
      }
      const data = await res.json();

      if (data && data.data && data.data.length > 0) {
        const topSlice = data.data.slice(0, Math.min(6, data.data.length));
        const picked = topSlice[Math.floor(Math.random() * topSlice.length)];
        const gifUrl = picked.images?.original?.url || picked.images?.downsized?.url;
        if (gifUrl) {
          console.log(`🌐 [Live GIPHY API]: Picked "${picked.title || searchQuery}" for query [${searchQuery}]: ${gifUrl}`);
          return gifUrl;
        }
      }
    } catch (err) {
      console.warn('⚠️ GIPHY API search warning:', err.message);
    }
    return null;
  }

  /**
   * Returns list of all categories (defaults + custom added by user)
   */
  async getAllCategories() {
    const defaultIds = this.defaultCategories.map(c => c.id);
    let customList = [];
    try {
      const config = await PersonaConfig.findOne();
      if (config && config.customReactionCategories) {
        customList = config.customReactionCategories;
      }
      const dbCategories = await MediaVault.distinct('category');
      customList = Array.from(new Set([...customList, ...dbCategories]));
    } catch (_) {}

    const all = [...this.defaultCategories];
    for (const cat of customList) {
      if (!defaultIds.includes(cat) && cat) {
        all.push({
          id: cat,
          label: cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' '),
          description: 'Custom reaction category',
          isCustom: true
        });
      }
    }
    return all;
  }
}

module.exports = new StickerService();
