const crypto = require('crypto');
const KnowledgeDoc = require('../models/KnowledgeDoc');

const CHUNK_CHARS = 900;
const CHUNK_OVERLAP = 150;

const STOPWORDS = new Set(('a an and are as at be but by can could do does for from had has have hello hey hi how i if in is it its just ' +
  'me my no not of on or our please so some than that the their them then there these they this to too us was we were what when ' +
  'where which who why will with would you your yours about also any been being into more most much only other over such very ' +
  'want need know tell send give get got okay ok thanks thank').split(' '));

const CATEGORY_RULES = [
  { category: 'pricing', re: /\b(price|pricing|cost|rates?|fees?|package|plan|₹|rs\.?|inr|usd|\$|per (hour|month|session))\b/i },
  { category: 'policy', re: /\b(refund|return|exchange|warranty|guarantee|terms|policy|cancellation|privacy)\b/i },
  { category: 'faq', re: /(^|\n)\s*(q[:.)]|faq|question)|\?\s*\n/i },
  { category: 'hours_location', re: /\b(open|opening|closing|hours|address|location|directions|parking|timings?)\b/i },
  { category: 'services', re: /\b(service|services|we offer|we provide|treatment|course|menu|product|catalog(ue)?)\b/i },
];

// Which categories can answer which kind of customer question
const INTENT_CATEGORIES = [
  { re: /\b(price|cost|how much|rates?|fees?|package|plan|discount|quote)\b/i, categories: ['pricing', 'services', 'faq', 'general'] },
  { re: /\b(refund|return|exchange|warranty|cancel|policy|terms)\b/i, categories: ['policy', 'faq', 'general'] },
  { re: /\b(open|close|hours|timing|address|where|location|directions|parking)\b/i, categories: ['hours_location', 'faq', 'general'] },
];
const ALL_CATEGORIES = ['pricing', 'policy', 'faq', 'hours_location', 'services', 'general'];

/**
 * Lowercase content words, most frequent first.
 */
function extractKeywords(text, limit = 20) {
  const counts = new Map();
  for (const raw of String(text || '').toLowerCase().match(/[a-z0-9₹$][a-z0-9'-]{2,}/g) || []) {
    const word = raw.replace(/'s$/, '').replace(/s$/, (m, i, w) => (w.length > 4 ? '' : m)); // naive singular
    if (STOPWORDS.has(word) || /^\d+$/.test(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([w]) => w);
}

// The chunk's own text decides; the document title is only a fallback
function tagCategory(text, title = '') {
  const match = CATEGORY_RULES.find(r => r.re.test(text)) || CATEGORY_RULES.find(r => r.re.test(title));
  return match ? match.category : 'general';
}

/**
 * Splits text into ~900 character chunks on paragraph/sentence boundaries, with overlap.
 */
function chunkText(text) {
  const clean = String(text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_CHARS) return [clean];

  const pieces = clean.split(/\n\n|(?<=[.!?])\s+/);
  const chunks = [];
  let current = '';
  for (const piece of pieces) {
    if ((current + ' ' + piece).length > CHUNK_CHARS && current) {
      chunks.push(current.trim());
      current = current.slice(-CHUNK_OVERLAP) + ' ' + piece;
    } else {
      current = current ? `${current} ${piece}` : piece;
    }
    // A single very long piece (e.g. a table row dump) is hard-split
    while (current.length > CHUNK_CHARS * 1.5) {
      chunks.push(current.slice(0, CHUNK_CHARS).trim());
      current = current.slice(CHUNK_CHARS - CHUNK_OVERLAP);
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Stores a document (file text, pasted text or link) as tagged chunks for one tenant.
 * Returns { sourceId, chunks }.
 */
async function ingestDocument({ ownerId, title, text, fileUrl = '', category = '', sourceType = 'text' }) {
  const sourceId = crypto.randomUUID();
  const body = sourceType === 'link' && !String(text || '').trim() ? `${title}. ${fileUrl}` : text;
  const chunks = chunkText(body);
  if (!chunks.length) throw new Error('No readable text found in this document.');

  const docs = chunks.map((chunk, i) => ({
    ownerId,
    title: String(title || 'Untitled').slice(0, 200),
    category: category || tagCategory(chunk, title),
    textContent: chunk,
    fileUrl,
    keywords: Array.from(new Set([...extractKeywords(title, 5), ...extractKeywords(chunk)])),
    sourceId,
    sourceType,
    chunkIndex: i,
  }));
  await KnowledgeDoc.insertMany(docs);
  return { sourceId, chunks: docs.length };
}

/**
 * Lists a tenant's documents (one row per source, not per chunk).
 */
async function listDocuments(ownerId) {
  return KnowledgeDoc.aggregate([
    { $match: { ownerId } },
    { $sort: { chunkIndex: 1 } },
    {
      $group: {
        _id: { $cond: [{ $eq: ['$sourceId', ''] }, { $toString: '$_id' }, '$sourceId'] },
        title: { $first: '$title' },
        fileUrl: { $first: '$fileUrl' },
        sourceType: { $first: '$sourceType' },
        categories: { $addToSet: '$category' },
        chunks: { $sum: 1 },
        preview: { $first: '$textContent' },
        createdAt: { $min: '$createdAt' },
      },
    },
    { $sort: { createdAt: -1 } },
  ]);
}

async function deleteDocument(ownerId, sourceId) {
  const bySource = await KnowledgeDoc.deleteMany({ ownerId, sourceId });
  if (bySource.deletedCount) return bySource.deletedCount;
  // Legacy single chunks without a sourceId are addressed by their own id
  if (/^[0-9a-f]{24}$/i.test(sourceId)) return (await KnowledgeDoc.deleteMany({ ownerId, _id: sourceId })).deletedCount;
  return 0;
}

/**
 * Finds the knowledge chunks that best answer a customer message.
 * Returns { chunks, wantsDocument, context } where context is ready for the system prompt.
 */
async function retrieve({ ownerId, incomingText, limit = 4 }) {
  const empty = { chunks: [], wantsDocument: false, context: '' };
  if (!ownerId || !incomingText) return empty;

  const keywords = extractKeywords(incomingText, 12);
  const intent = INTENT_CATEGORIES.find(i => i.re.test(incomingText));
  const allowedCategories = intent ? intent.categories : ALL_CATEGORIES;
  const wantsDocument = /\b(brochure|pdf|catalog(ue)?|price ?list|menu|document|docs|link|details|send (me|it|the))\b/i.test(incomingText);
  if (!keywords.length && !wantsDocument) return empty;

  const candidates = await KnowledgeDoc.find({
    ownerId,
    category: { $in: allowedCategories },
    ...(keywords.length ? { keywords: { $in: keywords } } : {}),
  }).limit(60).lean();

  const scored = candidates.map(doc => {
    const kw = new Set(doc.keywords || []);
    const titleWords = new Set(extractKeywords(doc.title, 10));
    const score = keywords.reduce((s, k) => s + (kw.has(k) ? 1 : 0) + (titleWords.has(k) ? 1.5 : 0), 0)
      + (intent && intent.categories[0] === doc.category ? 1 : 0);
    return { doc, score };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);

  const chunks = scored.map(s => s.doc);
  const context = chunks.map((c, i) =>
    `[${i + 1}] ${c.title} (${c.category})\n${c.textContent}${c.fileUrl ? `\nVerified link: ${c.fileUrl}` : ''}`
  ).join('\n\n');
  return { chunks, wantsDocument, context };
}

module.exports = { chunkText, tagCategory, extractKeywords, ingestDocument, listDocuments, deleteDocument, retrieve };
