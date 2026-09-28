const fs = require('fs');
const path = require('path');

/**
 * Curated catalog of reaction stickers matching Gen-Z chat habits & kawaii Genshin Impact emojis
 */
class StickerService {
  constructor() {
    this.baseUrl = (process.env.RENDER_EXTERNAL_URL || 'https://instagram-ai-bot-64tf.onrender.com').replace(/\/+$/, '');
    this.stickersDir = path.join(__dirname, '..', 'public', 'stickers');
    this.stickers = {};
    this.allGenshinStickers = [];

    this.initCatalog();
  }

  initCatalog() {
    // Standard reaction GIF / image backups
    this.stickers = {
      crying: [
        `${this.baseUrl}/stickers/crying.jpg`,
        'https://media.giphy.com/media/L95W4wv8nnb9K/giphy.gif',
        'https://media.giphy.com/media/d2lcHJTG5Tscg/giphy.gif',
      ],
      big_eyes: [
        `${this.baseUrl}/stickers/big_eyes.jpg`,
        'https://media.giphy.com/media/vFKqnCdLPNOKc/giphy.gif',
      ],
      skull: [
        'https://media.giphy.com/media/vjjCsx3izfRSq4Ze05/giphy.gif',
      ],
      fire: [
        'https://media.giphy.com/media/nrXif9YExO9EI/giphy.gif',
      ],
      side_eye: [
        'https://media.giphy.com/media/H5C8CevNMbpBqNqFjl/giphy.gif',
      ],
      heart: [
        'https://media.giphy.com/media/26BRv0ThflsDTjDUs/giphy.gif',
      ],
      genshin: [],
      kawaii: [],
      paimon: [],
      hutao: [],
      klee: [],
      nahida: [],
      furina: [],
      raiden: [],
      yaemiko: [],
      ganyu: [],
      xiao: [],
      venti: [],
      qiqi: [],
      keqing: [],
      mona: [],
      amber: [],
    };

    // Scan public/stickers directory and load all available files dynamically
    try {
      if (fs.existsSync(this.stickersDir)) {
        const files = fs.readdirSync(this.stickersDir);
        for (const file of files) {
          const lower = file.toLowerCase();
          const fileUrl = `${this.baseUrl}/stickers/${file}`;

          if (lower.startsWith('genshin_')) {
            this.allGenshinStickers.push(fileUrl);
            this.stickers.genshin.push(fileUrl);
            this.stickers.kawaii.push(fileUrl);

            // Categorize by character
            if (lower.includes('paimon')) this.stickers.paimon.push(fileUrl);
            if (lower.includes('hu_tao') || lower.includes('hutao')) this.stickers.hutao.push(fileUrl);
            if (lower.includes('klee')) this.stickers.klee.push(fileUrl);
            if (lower.includes('nahida')) this.stickers.nahida.push(fileUrl);
            if (lower.includes('furina')) this.stickers.furina.push(fileUrl);
            if (lower.includes('raiden')) this.stickers.raiden.push(fileUrl);
            if (lower.includes('yae')) this.stickers.yaemiko.push(fileUrl);
            if (lower.includes('ganyu')) this.stickers.ganyu.push(fileUrl);
            if (lower.includes('xiao')) this.stickers.xiao.push(fileUrl);
            if (lower.includes('venti')) this.stickers.venti.push(fileUrl);
            if (lower.includes('qiqi')) this.stickers.qiqi.push(fileUrl);
            if (lower.includes('keqing')) this.stickers.keqing.push(fileUrl);
            if (lower.includes('mona')) this.stickers.mona.push(fileUrl);
            if (lower.includes('amber')) this.stickers.amber.push(fileUrl);
          } else if (lower.includes('crying')) {
            this.stickers.crying.unshift(fileUrl);
          } else if (lower.includes('big_eyes')) {
            this.stickers.big_eyes.unshift(fileUrl);
            this.stickers.kawaii.push(fileUrl);
          }
        }
      }
    } catch (err) {
      console.warn('[StickerService] Failed to read public/stickers directory:', err.message);
    }

    console.log(`[StickerService] Indexed ${this.allGenshinStickers.length} Genshin stickers across ${Object.keys(this.stickers).length} categories.`);
  }

  hasSticker(type) {
    if (!type) return false;
    const cleanType = type.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
    if (this.stickers[cleanType] && this.stickers[cleanType].length > 0) return true;
    if (cleanType.includes('genshin') || cleanType.includes('chibi') || cleanType.includes('anime') || cleanType.includes('cute')) {
      return this.allGenshinStickers.length > 0;
    }
    return false;
  }

  getStickerUrl(type) {
    if (!type) return null;
    const cleanType = type.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');

    // Direct match
    let list = this.stickers[cleanType];

    // Fuzzy character matching
    if (!list || list.length === 0) {
      if (cleanType.includes('paimon')) list = this.stickers.paimon;
      else if (cleanType.includes('tao')) list = this.stickers.hutao;
      else if (cleanType.includes('klee')) list = this.stickers.klee;
      else if (cleanType.includes('nahida')) list = this.stickers.nahida;
      else if (cleanType.includes('furina')) list = this.stickers.furina;
      else if (cleanType.includes('raiden')) list = this.stickers.raiden;
      else if (cleanType.includes('yae')) list = this.stickers.yaemiko;
      else if (cleanType.includes('ganyu')) list = this.stickers.ganyu;
      else if (cleanType.includes('xiao')) list = this.stickers.xiao;
      else if (cleanType.includes('cry') || cleanType.includes('sad')) list = this.stickers.crying;
      else if (cleanType.includes('eye') || cleanType.includes('plead')) list = this.stickers.big_eyes;
      else if (cleanType.includes('genshin') || cleanType.includes('chibi') || cleanType.includes('kawaii') || cleanType.includes('cute')) {
        list = this.allGenshinStickers;
      }
    }

    if (!list || list.length === 0) {
      // Fallback to random Genshin sticker if any
      list = this.allGenshinStickers;
    }

    if (!list || list.length === 0) return null;
    const idx = Math.floor(Math.random() * list.length);
    return list[idx];
  }
}

module.exports = new StickerService();
