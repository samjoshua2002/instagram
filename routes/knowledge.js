const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ragService = require('../services/ragService');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
const ALLOWED_EXT = ['.pdf', '.txt', '.md', '.csv'];

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `doc-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ALLOWED_EXT.includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only PDF, TXT, MD or CSV files are supported.'), ok);
  },
});

const publicUrl = (filename) =>
  `${(process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '')}/uploads/${filename}`;

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
        fileUrl: publicUrl(req.file.filename),
        category: (req.body.category || '').trim(),
        sourceType: 'file',
      });
      res.json({ success: true, ...result });
    } catch (err) {
      fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: err.message || 'Could not read this file.' });
    }
  });
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
    res.json({ success: true, ...result });
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
    res.json({ success: true, ...result });
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
