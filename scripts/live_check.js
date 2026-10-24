// Read-only live checks (PLAN 17.1 #4): sign-in, passkeys, document search, webhook,
// reply delays and per-account data separation. Never sends a message or writes data.
// Usage: node scripts/live_check.js
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const BASE = (process.env.BACKEND_URL || '').replace(/\/$/, '');
const results = [];
const check = (area, name, ok, detail = '') => {
  results.push({ area, name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${area}] ${name}${detail ? ` - ${detail}` : ''}`);
};
const http = axios.create({ baseURL: BASE, timeout: 60000, validateStatus: () => true });
const bearer = token => ({ headers: { Authorization: `Bearer ${token}` } });
const tokenFor = user => jwt.sign({ userId: user._id.toString(), username: user.username, role: user.role || 'user' }, process.env.JWT_SECRET, { expiresIn: '5m' });

async function main() {
  // Render free instances sleep, so wake the server first
  const status = await http.get('/api/status');
  check('server', 'live backend answers /api/status', status.status === 200, `HTTP ${status.status}`);

  // Instagram webhook
  const challenge = 'chk' + Date.now();
  const verify = await http.get('/webhook', { params: { 'hub.mode': 'subscribe', 'hub.verify_token': process.env.WEBHOOK_VERIFY_TOKEN, 'hub.challenge': challenge } });
  check('webhook', 'Meta verify handshake returns the challenge', verify.status === 200 && String(verify.data) === challenge, `HTTP ${verify.status}`);
  const badVerify = await http.get('/webhook', { params: { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': challenge } });
  check('webhook', 'wrong verify token is refused', badVerify.status === 403, `HTTP ${badVerify.status}`);
  const emptyBody = JSON.stringify({ object: 'instagram', entry: [] });
  const unsigned = await http.post('/webhook', emptyBody, { headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=bad' } });
  check('webhook', 'event with a forged signature is refused', unsigned.status === 401, `HTTP ${unsigned.status}`);
  const sig = 'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET).update(emptyBody).digest('hex');
  const signed = await http.post('/webhook', emptyBody, { headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig } });
  check('webhook', 'correctly signed (empty) event is accepted', signed.status === 200, `HTTP ${signed.status}`);

  // Sign-in guard
  const noToken = await http.get('/api/conversations');
  check('auth', 'no token is refused', noToken.status === 401, `HTTP ${noToken.status}`);
  const junk = await http.get('/api/conversations', bearer('not-a-token'));
  check('auth', 'junk token is refused', junk.status === 401, `HTTP ${junk.status}`);
  const forged = jwt.sign({ userId: '000000000000000000000000' }, 'wrong-secret');
  const forgedRes = await http.get('/api/conversations', bearer(forged));
  check('auth', 'token signed with the wrong secret is refused', forgedRes.status === 401, `HTTP ${forgedRes.status}`);
  const badLogin = await http.post('/api/auth/login', { identifier: 'nobody-' + Date.now() + '@example.com', email: 'nobody@example.com', password: 'wrong-password' });
  check('auth', 'login with an unknown account is refused', badLogin.status >= 400 && badLogin.status < 500, `HTTP ${badLogin.status}`);

  // Passkeys (no account given, so nothing is stored)
  const pk = await http.get('/api/auth/passkey/login-options');
  check('passkey', 'login options include a challenge and site id', pk.status === 200 && !!pk.data?.challenge && !!pk.data?.rpId, `HTTP ${pk.status}, rpId ${pk.data?.rpId || '-'}`);

  // Database: read only
  // Some Windows DNS setups refuse the SRV lookup that mongodb+srv needs
  require('dns').setServers(['8.8.8.8', '1.1.1.1']);
  const uri = (process.env.MONGODB_URI || '').trim().replace(/^["']|["']$/g, '');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  check('database', 'MongoDB connection', true);
  const User = require('../models/User');
  const KnowledgeDoc = require('../models/KnowledgeDoc');
  const UserMemory = require('../models/UserMemory');
  const ragService = require('../services/ragService');

  for (const name of ['KnowledgeDoc', 'Lead', 'Booking', 'Storyboard', 'WorkspaceFeatures', 'MediaVault', 'Message', 'UserMemory']) {
    const Model = require(`../models/${name}`);
    const total = await Model.countDocuments();
    const orphans = await Model.countDocuments({ $or: [{ ownerId: null }, { ownerId: { $exists: false } }] });
    // Old single-account records (before multi-account) may have no owner; report them, fail only on newer models
    const strict = ['KnowledgeDoc', 'Lead', 'Booking', 'Storyboard', 'WorkspaceFeatures'].includes(name);
    check('isolation', `${name}: every record has an owner (${total} records)`, strict ? orphans === 0 : true, orphans ? `${orphans} without owner${strict ? '' : ' (legacy, allowed)'}` : '');
  }

  // Search: each account only ever gets its own documents
  const owners = await KnowledgeDoc.distinct('ownerId');
  for (const ownerId of owners.slice(0, 5)) {
    const doc = await KnowledgeDoc.findOne({ ownerId }).lean();
    const question = `${doc.title} ${(doc.keywords || []).slice(0, 5).join(' ')}`;
    const { chunks } = await ragService.retrieve({ ownerId, incomingText: question });
    check('search', `account ${String(ownerId).slice(-6)}: a question from its own document finds it`, chunks.length > 0, `${chunks.length} hits`);
    check('isolation', `account ${String(ownerId).slice(-6)}: search returns only its own documents`, chunks.every(c => String(c.ownerId) === String(ownerId)));
  }
  if (!owners.length) check('search', 'no uploaded documents yet, search not tested', true);

  // Signed-in reads for two real accounts: each sees only its own chats and documents
  const users = await User.find({ role: { $ne: 'superadmin' }, isBanned: { $ne: true } }).sort({ createdAt: -1 }).limit(2).lean();
  for (const user of users) {
    const tag = String(user._id).slice(-6);
    const me = await http.get('/api/auth/me', bearer(tokenFor(user)));
    if (me.status === 401) { check('auth', `account ${tag}: server accepts a valid token`, false, 'HTTP 401 - JWT_SECRET in .env differs from Render'); continue; }
    check('auth', `account ${tag}: valid token signs in to /api/auth/me`, me.status === 200, `HTTP ${me.status}`);
    const convos = await http.get('/api/conversations', bearer(tokenFor(user)));
    const list = Array.isArray(convos.data) ? convos.data : (convos.data?.conversations || convos.data?.items || []);
    const ownSenders = new Set((await UserMemory.find({ $or: [{ ownerId: user._id }, { ownerUsername: user.username }] }).select('senderId').lean()).map(m => String(m.senderId)));
    const foreign = list.filter(c => c.senderId && !ownSenders.has(String(c.senderId)));
    check('isolation', `account ${tag}: chat list holds only its own chats (${list.length})`, convos.status === 200 && foreign.length === 0, foreign.length ? `${foreign.length} foreign` : `HTTP ${convos.status}`);
    const kb = await http.get('/api/knowledge', bearer(tokenFor(user)));
    const items = kb.data?.items || [];
    check('isolation', `account ${tag}: document list holds only its own documents (${items.length})`, kb.status === 200 && items.every(i => !i.ownerId || String(i.ownerId) === String(user._id)), `HTTP ${kb.status}`);
  }

  await mongoose.disconnect();

  // Reply delays: run the exact delay rules from server.js on sample replies
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const block = src.slice(src.indexOf('    let humanTypingDelayMs;'), src.indexOf('    console.log(`⏳ [Realistic Human Typing Delay]'));
  const delayFor = new Function('replyText', 'isReelOrShare', 'enabledFeatures', `
    const trimmedReply = (replyText || '').trim();
    const charLength = trimmedReply.length;
    const isEmojiOnly = /^[\\p{Emoji}\\s\\d\\p{P}]+$/u.test(trimmedReply);
    const isUltraShort = charLength <= 4 || isEmojiOnly;
    ${block}
    return humanTypingDelayMs;`);
  const on = { antiAiHumanMimicry: true };
  const cases = [['😂', 1800, 3000], ['haha yes da', 3500, 6500], ['a'.repeat(60), 7000, 12000], ['a'.repeat(150), 13000, 20000], ['a'.repeat(400), 21000, 34000]];
  for (const [text, min, max] of cases) {
    const ms = delayFor(text, false, on);
    check('delay', `${text.length}-char reply waits ${min / 1000}-${max / 1000}s`, ms >= min && ms <= max, `${ms}ms`);
  }
  check('delay', 'mimicry off replies after a fixed 1.2s', delayFor('hello there', false, { antiAiHumanMimicry: false }) === 1200);
  const { bubbleGapMs, splitIntoBubbles } = require('../services/humanizeService');
  const gaps = Array.from({ length: 200 }, bubbleGapMs);
  check('delay', 'gap between bubbles stays 1-2s', gaps.every(g => g >= 1000 && g < 2000));
  check('delay', 'long reply splits into at most 3 bubbles', splitIntoBubbles('One thing first. '.repeat(20)).length <= 3);

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(err => { console.error('Check run stopped:', err.message); process.exit(1); });
