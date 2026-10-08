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
  }

  initCatalog() {
    this.stickers = {
      joy: [
        'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif',
        'https://media.giphy.com/media/WpaVhEcp3nnBAj2LAc/giphy.gif',
      ],
      laugh: [
        'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif',
        'https://media.giphy.com/media/WpaVhEcp3nnBAj2LAc/giphy.gif',
      ],
      lol: [
        'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif',
        'https://media.giphy.com/media/vjjCsx3izfRSq4Ze05/giphy.gif',
      ],
      skull: [
        'https://media.giphy.com/media/vjjCsx3izfRSq4Ze05/giphy.gif',
      ],
      wonder: [
        'https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif',
      ],
      shock: [
        'https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif',
      ],
      sad: [
        'https://media.giphy.com/media/L95W4wv8nnb9K/giphy.gif',
      ],
      crying: [
        'https://media.giphy.com/media/L95W4wv8nnb9K/giphy.gif',
      ],
      happy: [
        'https://media.giphy.com/media/nrXif9YExO9EI/giphy.gif',
        'https://media.giphy.com/media/26BRv0ThflsDTjDUs/giphy.gif',
      ],
      side_eye: [
        'https://media.giphy.com/media/H5C8CevNMbpBqNqFjl/giphy.gif',
      ],
      confused: [
        'https://media.giphy.com/media/g01ZnwAUvutuK8GIQn/giphy.gif',
        'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif',
      ],
      cool: [
        'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif',
        'https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif',
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
   * Retrieves image/GIF URL. Prioritizes user's uploaded MediaVault items.
   */
  async getStickerUrl(type) {
    if (!type) return null;
    const cleanType = type.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');

    // Strictly reject any genshin / anime stickers
    if (cleanType.includes('genshin') || cleanType.includes('paimon') || cleanType.includes('furina') || cleanType.includes('klee')) {
      return null;
    }

    // 1. First priority: Check user-uploaded media in MongoDB MediaVault
    try {
      const userItems = await MediaVault.find({ category: cleanType });
      if (userItems && userItems.length > 0) {
        const idx = Math.floor(Math.random() * userItems.length);
        console.log(`🎬 [Media Vault Hit]: Selected user upload for category "${cleanType}": ${userItems[idx].url}`);
        return userItems[idx].url;
      }
    } catch (e) {
      console.warn('⚠️ MediaVault DB check error:', e.message);
    }

    // 2. Second priority: Built-in reaction GIF catalog
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
        // Fallback to random funny cat/joy meme
        list = this.stickers.joy.concat(this.stickers.cat);
      }
    }

    if (!list || list.length === 0) return null;
    const idx = Math.floor(Math.random() * list.length);
    return list[idx];
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
