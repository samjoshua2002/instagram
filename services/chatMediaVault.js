/**
 * Reaction images people send you (stickers, memes, reaction GIFs) are saved to your Media Vault,
 * so the AI can send them back later, like you would reuse a sticker you got.
 *
 * - Only photos already copied into our own storage (Instagram's links expire) are considered.
 * - A fast model reads the photo's description and keeps only reusable reaction images; selfies,
 *   personal photos, screenshots, documents and anything about a real person's private life never
 *   go in, so a friend's private photo can't end up being sent to someone else.
 * - Saved ones wait for you ("pending"): the AI only uses them after you tap Keep.
 * - The same image (same bytes) is saved once.
 */
const crypto = require('crypto');
const MediaVault = require('../models/MediaVault');

const FAST = () => process.env.FAST_MODEL || 'gpt-5.4-mini';

/**
 * Pure: the model's answer, checked. Returns { name, category, keywords } for a reusable reaction
 * image, or null. The category must be one of the vault's categories.
 */
function parseVerdict(out, categoryIds = []) {
  if (!out || out.reusable !== true) return null;
  const ids = new Set(categoryIds.map(c => String(c).toLowerCase()));
  const category = String(out.category || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!ids.has(category)) return null;
  const keywords = (Array.isArray(out.keywords) ? out.keywords : [])
    .map(k => String(k || '').toLowerCase().trim().slice(0, 30)).filter(Boolean).slice(0, 6);
  const name = String(out.name || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Sticker from a chat';
  return { name, category, keywords };
}

/**
 * Pure: does this image need a PNG copy to be sent? Meta's docs list PNG and JPEG for sending; GIFs
 * already go out fine from the vault. Stickers often arrive as WebP.
 */
function needsPng(contentType) {
  return !/^image\/(png|jpe?g|gif)$/i.test(String(contentType || '').split(';')[0].trim());
}

/** A PNG copy of a stored file, saved next to it. Returns { fileId, contentType } or null. */
async function pngCopy(fileId, contentType) {
  const { openFile, storeBuffer } = require('./importantService');
  const { toPng } = require('./mediaService');
  const chunks = [];
  await new Promise((resolve, reject) => {
    openFile(fileId).on('data', d => chunks.push(d)).on('end', resolve).on('error', reject);
  });
  const ext = (String(contentType).match(/^image\/([a-z0-9]+)/i) || [])[1] || 'webp';
  const png = await toPng(Buffer.concat(chunks), ext);
  if (!png) return null;
  const saved = await storeBuffer(png, `vault-${fileId}.png`, 'image/png', { from: String(fileId) });
  return { fileId: saved.fileId, contentType: 'image/png' };
}

/** Pure: the public link for a saved item (Instagram fetches the image from here when the AI sends it). */
function publicUrl(token, base = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 5000}`) {
  return `${String(base).replace(/\/+$/, '')}/vault-media/${token}`;
}

async function hashOf(fileId) {
  const { openFile } = require('./importantService');
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    openFile(fileId).on('data', d => hash.update(d)).on('end', resolve).on('error', reject);
  });
  return hash.digest('hex');
}

async function judge(description, categories) {
  const azureOpenAI = require('./azureOpenAI');
  const list = categories.map(c => `${c.id}: ${c.description || c.label || c.id}`).join('\n');
  const out = await azureOpenAI.jsonWithFallback(FAST(), [
    { role: 'system', content: `You sort images someone received in an Instagram DM. Keep ONLY reusable reaction images: stickers, cartoon/emoji stickers, meme reaction images, reaction GIF frames that anyone could send back in another chat.
NOT reusable (reusable=false): selfies or photos of real people in their own life, family/friends photos, places, food, pets photographed at home, screenshots of chats or apps, documents, receipts, anything private, anything sexual, violent or hateful.
Vault categories (pick one id):
${list}
JSON only: {"reusable": true|false, "category": "<id>", "name": "<2-5 words>", "keywords": ["3-6 short words for when it fits"]}` },
    { role: 'user', content: `The image: ${String(description).slice(0, 800)}` },
  ]);
  return parseVerdict(out, categories.map(c => c.id));
}

/**
 * Looks at a photo that was just saved from a chat and, if it's a reusable reaction image, adds it
 * to the owner's vault as pending. Never throws. Returns the vault item or null.
 */
async function consider({ ownerId = null, senderId = '', name = '', fileId = null, contentType = '', description = '' }) {
  try {
    if (!fileId || !description || /^test_/.test(String(senderId))) return null;
    const stickerService = require('./stickerService');
    const owner = ownerId ? { _id: ownerId } : null;
    const categories = (await stickerService.getAllCategories(owner).catch(() => [])) || [];
    if (!categories.length) return null;
    const verdict = await judge(description, categories);
    if (!verdict) return null;
    const contentHash = await hashOf(fileId);
    const dup = await MediaVault.exists({ ownerId, contentHash });
    if (dup) return null;
    // WebP and other types Instagram may not take are sent as a PNG copy (first frame if animated)
    let sendFile = { fileId, contentType };
    if (needsPng(contentType)) {
      sendFile = await pngCopy(fileId, contentType);
      if (!sendFile) return null;
    }
    const token = crypto.randomBytes(18).toString('hex');
    const item = await MediaVault.create({
      ...verdict,
      ownerId,
      url: publicUrl(token),
      mediaType: /gif/i.test(sendFile.contentType) ? 'gif' : 'sticker',
      caption: String(description).slice(0, 300),
      reviewStatus: 'pending',
      source: 'chat',
      fileId: sendFile.fileId,
      contentType: sendFile.contentType,
      contentHash,
      publicToken: token,
      fromSenderId: String(senderId),
      fromName: String(name || '').slice(0, 80),
    });
    console.log(`🗂️ [Vault] Saved a ${verdict.category} reaction image from ${name || senderId} (waiting for your Keep).`);
    return item;
  } catch (err) {
    console.warn('⚠️ [Vault] Could not save a chat image:', err.message);
    return null;
  }
}

module.exports = { consider, parseVerdict, publicUrl, needsPng };
