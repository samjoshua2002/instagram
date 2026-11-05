const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ragService = require('../services/ragService');
const KnowledgeDoc = require('../models/KnowledgeDoc');
const { randomFilename, resolveInsideDir } = require('../lib/serverSecurity');
const workspaceFeatureService = require('../services/workspaceFeatureService');

// A new document should be used straight away, so make sure document search is on
const afterIngest = (user) => workspaceFeatureService.enableDocumentSearch(user).then(v => v.enabledFeatures.ragKnowledgeBase).catch(() => undefined);

const router = express.Router();

// Business documents are private: kept outside public/ and served only to their owner
const storageDir = path.join(__dirname, '..', 'storage', 'knowledge');
fs.mkdirSync(storageDir, { recursive: true });
// Documents uploaded before this change still sit in public/uploads (no longer served statically)
const legacyUploadsDir = path.join(__dirname, '..', 'public', 'uploads');
const ALLOWED_EXT = ['.pdf', '.txt', '.md', '.csv'];
const CONTENT_TYPES = { '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };
const DOC_NAME = /^doc-[A-Za-z0-9-]+\.(pdf|txt|md|csv)$/i;

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, storageDir),
    filename: (req, file, cb) => cb(null, randomFilename('doc-', path.extname(file.originalname))),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ALLOWED_EXT.includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only PDF, TXT, MD or CSV files are supported.'), ok);
  },
});

// Owner-checked download link (needs the signed-in user's Authorization header)
const fileUrlFor = (filename) =>
  `${(process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '')}/api/knowledge/files/${filename}`;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function readText(filePath, ext) {
  if (ext === '.pdf') {
    // lib path avoids pdf-parse's debug self-test that runs when its index is required directly
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    // Copy into a fresh Uint8Array: Node may return a pooled Buffer (byteOffset > 0)
    // and pdf.js reads the whole underlying ArrayBuffer, which breaks XRef offsets
    const data = await pdfParse(new Uint8Array(fs.readFileSync(filePath)));
    return data.text || '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

// Mounted behind requireAuth; every document is scoped to req.user

/** GET /api/knowledge: the tenant's documents and links */
router.get('/', async (req, res) => {
  try {
    res.json({ items: await ragService.listDocuments(req.user._id) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load documents' });
  }
});

/** POST /api/knowledge/upload (multipart: file, title?, category?) */
router.post('/upload', (req, res) => {
  upload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });
    if (!req.file) return res.status(400).json({ error: 'No file was uploaded.' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    try {
      const text = await readText(req.file.path, ext);
      const result = await ragService.ingestDocument({
        ownerId: req.user._id,
        title: (req.body.title || req.file.originalname.replace(/\.[^.]+$/, '')).trim(),
        text,
        fileUrl: fileUrlFor(req.file.filename),
        category: (req.body.category || '').trim(),
        sourceType: 'file',
      });
      res.json({ success: true, ...result, documentSearchOn: await afterIngest(req.user) });
    } catch (err) {
      fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: err.message || 'Could not read this file.' });
    }
  });
});

/** GET /api/knowledge/files/:filename: an uploaded document, only for the account that uploaded it */
router.get('/files/:filename', async (req, res) => {
  try {
    const filename = String(req.params.filename || '');
    if (!DOC_NAME.test(filename)) return res.status(404).json({ error: 'Document not found.' });
    // New links end in /api/knowledge/files/<name>, old ones in /uploads/<name>
    const owned = await KnowledgeDoc.exists({
      ownerId: req.user._id,
      fileUrl: new RegExp(`/(api/knowledge/files|uploads)/${escapeRegex(filename)}$`),
    });
    if (!owned) return res.status(404).json({ error: 'Document not found.' });
    const filePath = [storageDir, legacyUploadsDir]
      .map(dir => resolveInsideDir(dir, filename))
      .find(p => p && fs.existsSync(p));
    if (!filePath) return res.status(404).json({ error: 'Document not found.' });
    res.setHeader('Content-Type', CONTENT_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    fs.createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Could not load document' });
  }
});

/** POST /api/knowledge/link { title, url, description?, category? } */
router.post('/link', async (req, res) => {
  try {
    const { title, url, description = '', category = '' } = req.body || {};
    if (!title || !/^https?:\/\/\S+$/i.test(url || '')) {
      return res.status(400).json({ error: 'A title and a valid http(s) link are required.' });
    }
    const result = await ragService.ingestDocument({
      ownerId: req.user._id, title, text: description, fileUrl: url, category, sourceType: 'link',
    });
    res.json({ success: true, ...result, documentSearchOn: await afterIngest(req.user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** POST /api/knowledge/text { title, text, category? } */
router.post('/text', async (req, res) => {
  try {
    const { title, text, category = '' } = req.body || {};
    if (!title || !(text || '').trim()) return res.status(400).json({ error: 'A title and some text are required.' });
    const result = await ragService.ingestDocument({ ownerId: req.user._id, title, text, category, sourceType: 'text' });
    res.json({ success: true, ...result, documentSearchOn: await afterIngest(req.user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** DELETE /api/knowledge/:sourceId */
router.delete('/:sourceId', async (req, res) => {
  try {
    const deleted = await ragService.deleteDocument(req.user._id, req.params.sourceId);
    if (!deleted) return res.status(404).json({ error: 'Document not found.' });
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;
