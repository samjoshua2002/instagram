/**
 * Curated catalog of universal, funny reaction GIFs & memes (Tenor / Giphy style)
 * Replaces hardcoded Genshin stickers with relatable, funny reaction GIFs.
 */
class StickerService {
  constructor() {
    this.stickers = {};
    this.allMemes = [];
    this.initCatalog();
  }

  initCatalog() {
    this.stickers = {
      laugh: [
        'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif',
        'https://media.giphy.com/media/WpaVhEcp3nnBAj2LAc/giphy.gif',
      ],
      skull: [
        'https://media.giphy.com/media/vjjCsx3izfRSq4Ze05/giphy.gif',
      ],
      side_eye: [
        'https://media.giphy.com/media/H5C8CevNMbpBqNqFjl/giphy.gif',
      ],
      shock: [
        'https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif',
      ],
      crying: [
        'https://media.giphy.com/media/L95W4wv8nnb9K/giphy.gif',
      ],
      confused: [
        'https://media.giphy.com/media/g01ZnwAUvutuK8GIQn/giphy.gif',
        'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif',
      ],
      cat: [
        'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif',
        'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
        'https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif',
      ],
      fire: [
        'https://media.giphy.com/media/nrXif9YExO9EI/giphy.gif',
      ],
      heart: [
        'https://media.giphy.com/media/26BRv0ThflsDTjDUs/giphy.gif',
      ],
    };

    // Flatten all into general meme pool
    this.allMemes = Object.values(this.stickers).flat();
  }

  hasSticker(type) {
    if (!type) return false;
    const cleanType = type.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
    // Strictly reject genshin / anime stickers
    if (cleanType.includes('genshin') || cleanType.includes('paimon') || cleanType.includes('furina') || cleanType.includes('klee')) {
      return false;
    }
    return true;
  }

  getStickerUrl(type) {
    if (!type) return null;
    const cleanType = type.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');

    // Strictly reject any genshin / anime stickers
    if (cleanType.includes('genshin') || cleanType.includes('paimon') || cleanType.includes('furina') || cleanType.includes('klee')) {
      return null;
    }

    let list = this.stickers[cleanType];

    // Fuzzy matching for reaction types
    if (!list || list.length === 0) {
      if (cleanType.includes('laugh') || cleanType.includes('haha') || cleanType.includes('lmao') || cleanType.includes('rofl')) {
        list = this.stickers.laugh;
      } else if (cleanType.includes('skull') || cleanType.includes('dead')) {
        list = this.stickers.skull;
      } else if (cleanType.includes('side') || cleanType.includes('sus') || cleanType.includes('bombastic')) {
        list = this.stickers.side_eye;
      } else if (cleanType.includes('shock') || cleanType.includes('omg') || cleanType.includes('wow') || cleanType.includes('what')) {
        list = this.stickers.shock;
      } else if (cleanType.includes('cry') || cleanType.includes('sad') || cleanType.includes('tear')) {
        list = this.stickers.crying;
      } else if (cleanType.includes('confus') || cleanType.includes('idk') || cleanType.includes('travolta')) {
        list = this.stickers.confused;
      } else if (cleanType.includes('cat') || cleanType.includes('kitten')) {
        list = this.stickers.cat;
      } else if (cleanType.includes('fire') || cleanType.includes('lit') || cleanType.includes('hype')) {
        list = this.stickers.fire;
      } else if (cleanType.includes('heart') || cleanType.includes('love')) {
        list = this.stickers.heart;
      } else {
        // Fallback to random funny cat/laugh meme
        list = this.stickers.cat.concat(this.stickers.laugh);
      }
    }

    if (!list || list.length === 0) return null;
    const idx = Math.floor(Math.random() * list.length);
    return list[idx];
  }
}

module.exports = new StickerService();
