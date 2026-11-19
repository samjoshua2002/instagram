const test = require('node:test');
const assert = require('node:assert');
const { editRatio, nextStatus, PROMOTE_AT, MIN_EDIT_RATIO } = require('../services/correctionLearning');
const Message = require('../models/Message');

test('edit ratio: the same text is 0, a total rewrite is near 1', () => {
  assert.equal(editRatio('enna panra', 'enna panra'), 0);
  assert.equal(editRatio('Enna  panra', 'enna panra'), 0);
  assert.ok(editRatio('Hello! I hope you are having a wonderful day', 'enna panra bro') > MIN_EDIT_RATIO);
  assert.ok(editRatio('hii how are you', 'hii how r you') < MIN_EDIT_RATIO);
  assert.equal(editRatio('', 'x'), 1);
});

test('a learned rule turns active only after 3 agreeing takeovers and none against', () => {
  assert.equal(nextStatus({ support: 1 }), 'candidate');
  assert.equal(nextStatus({ support: PROMOTE_AT - 1 }), 'candidate');
  assert.equal(nextStatus({ support: PROMOTE_AT }), 'active');
  assert.equal(nextStatus({ support: PROMOTE_AT, contradictions: 1, status: 'active' }), 'candidate');
  assert.equal(nextStatus({ support: 2, contradictions: 2 }), 'retired');
});

test('a rule you keep confirming is not blocked forever by one takeover against it', () => {
  assert.equal(nextStatus({ support: 7, contradictions: 1 }), 'active');
  assert.equal(nextStatus({ support: 4, contradictions: 1 }), 'active');
  assert.equal(nextStatus({ support: 4, contradictions: 2 }), 'candidate');
  assert.equal(nextStatus({ support: 7, contradictions: 7, status: 'active' }), 'retired');
  assert.equal(nextStatus({ support: 9, contradictions: 1, status: 'retired' }), 'active');
});

test('message origin: only the owner\'s own typing counts as human', () => {
  assert.equal(Message.originOf({ role: 'user' }), 'contact');
  assert.equal(Message.originOf({ role: 'assistant', sentByAI: false }), 'human');
  assert.equal(Message.originOf({ role: 'assistant', sentByAI: true }), 'ai_auto');
  assert.equal(Message.originOf({ role: 'assistant', sentByAI: true, isCheckIn: true }), 'ai_checkin');
  assert.equal(Message.originOf({ role: 'assistant', sentByAI: true, isReminder: true }), 'ai_reminder');
  assert.deepEqual(Message.HUMAN_ORIGINS, ['human', 'human_after_draft']);
});

test('@tags in answers become "Name (@handle)"; unknown tags stay as typed', () => {
  const { tagsIn, expandWith } = require('../lib/mentions');
  assert.deepEqual(tagsIn('her brother is @arun_7 and @[Amma]').handles, ['arun_7']);
  assert.deepEqual(tagsIn('her brother is @arun_7 and @[Amma]').names, ['Amma']);
  const people = [{ name: 'Arun', handle: '@arun_7' }, { name: 'Amma', handle: '' }];
  assert.equal(expandWith('her brother is @arun_7', people), 'her brother is Arun (@arun_7)');
  assert.equal(expandWith('mom is @[Amma]', people), 'mom is Amma');
  assert.equal(expandWith('mail me at sam@gmail.com', people), 'mail me at sam@gmail.com');
  assert.equal(expandWith('who is @nobody', people), 'who is @nobody');
});

test('owner name is put into prompts once ("Sam Joshua", never "Sam Joshua Joshua")', () => {
  const { personalize } = require('../services/creatorIdentity');
  assert.equal(personalize("Sam Joshua's helper. Sam likes anime.", 'Sam Joshua'), "Sam Joshua's helper. Sam Joshua likes anime.");
  assert.equal(personalize("Sam Joshua's helper. Sam's mom.", 'Priya'), "Priya's helper. Priya's mom.");
  assert.equal(personalize('relationshipToSam', 'Priya'), 'relationshipToSam');
});

test('your "follower" label wins over the AI reading the chats as close', () => {
  const { computeCloseness } = require('../services/closeness');
  const now = Date.parse('2026-11-17');
  const base = { category: 'online_friend', chatsCount: 955, firstSeen: '2025-01-01', lastSeen: '2026-11-15', memoryBond: 'close' };
  assert.equal(computeCloseness(base, now).level, 'close');
  const labelled = computeCloseness({ ...base, relationshipToSam: 'Follower / Online Contact' }, now);
  assert.notEqual(labelled.level, 'close');
  assert.ok(labelled.score < 75);
});

test('link requests find the right link in your documents', () => {
  const { linkAsked } = require('../services/ragService');
  assert.equal(linkAsked('Can u share ur GitHub account'), 'github');
  assert.equal(linkAsked('send ur linkedin'), 'linkedin');
  assert.equal(linkAsked('drop ur portfolio link'), 'portfolio');
  assert.equal(linkAsked('whats ur site'), 'link');
  assert.equal(linkAsked('how was ur day'), null);
});

test('every reply prompt forbids claiming something that did not happen', () => {
  const { HUMAN_CHAT_RULES, humanChatRules } = require('../services/replyStyle');
  assert.match(HUMAN_CHAT_RULES, /NEVER CLAIM SOMETHING THAT DID NOT HAPPEN/);
  assert.match(humanChatRules({ allowEmoji: true, allowTanglish: true }), /NEVER CLAIM SOMETHING THAT DID NOT HAPPEN/);
  assert.match(humanChatRules({ allowTanglish: true }), /Tanglish/);
  assert.doesNotMatch(humanChatRules({ allowEmoji: true }), /NO EMOJI/);
});

test('automatic style check: finds how the AI differs from your own messages', () => {
  const { profile, compare } = require('../services/styleCompare');
  const you = profile([...Array(40)].map((_, i) => (i % 2 ? 'enna da panra' : 'seri machi') + (i % 5 ? '' : ' 😂')));
  const ai = profile([...Array(40)].map(() => 'Hey! That sounds really great, tell me more about how your day went.'));
  const out = compare(you, ai);
  const keys = out.diffs.map(d => d.key);
  assert.ok(keys.includes('length'));
  assert.ok(keys.includes('tanglish'));
  assert.ok(keys.includes('case'));
  assert.ok(out.match < 60);
  const same = compare(you, you);
  assert.equal(same.diffs.length, 0);
  assert.equal(same.match, 100);
});

// The owner's real Voice Check numbers (19 Nov): the old cutoffs missed length and Tanglish
const ownerStats = { count: 1178, avgWords: 3.1, medianWords: 3, tanglishShare: 1, emojiShare: 15, lowerStartShare: 2, capStartShare: 82, periodEndShare: 5, questionShare: 4, topWords: ['the', 'it\'s', 'that\'s', 'need', 'am', 'her'] };
const aiStats = { count: 1176, avgWords: 5, medianWords: 5, tanglishShare: 10, emojiShare: 20, lowerStartShare: 45, capStartShare: 48, periodEndShare: 5, questionShare: 3, topWords: ['the'] };

test('style check: a 60% longer AI and 10x the Tanglish are flagged and fixed', () => {
  const { compare } = require('../services/styleCompare');
  const out = compare(ownerStats, aiStats);
  const byKey = Object.fromEntries(out.diffs.map(d => [d.key, d]));
  assert.ok(byKey.length, 'length gap 3.1 vs 5 is flagged');
  assert.match(byKey.length.fix, /about 3 words/);
  assert.ok(byKey.tanglish, 'Tanglish 1% vs 10% is flagged');
  assert.match(byKey.tanglish.text, /AI uses Tanglish much more/);
  assert.ok(byKey.case);
  assert.match(byKey.case.fix, /capital/);
  assert.equal(byKey.emoji, undefined, 'emoji 15% vs 20% is close enough');
  assert.equal(byKey.questions, undefined);
});

test('style check: ordinary English words and contractions are not "your words"', () => {
  const { compare } = require('../services/styleCompare');
  const out = compare(ownerStats, aiStats);
  assert.equal(out.diffs.find(d => d.key === 'words'), undefined);
  const curly = compare({ ...ownerStats, topWords: ['it’s', 'that’s', 'machi', 'scene'] }, aiStats);
  assert.match(curly.diffs.find(d => d.key === 'words').text, /machi, scene\.$/);
});

test('style check: the score follows the size of the gaps, not how many were flagged', () => {
  const { compare } = require('../services/styleCompare');
  const real = compare(ownerStats, aiStats).match;
  assert.ok(real < 60, `big real gaps score low (got ${real})`);
  const closer = compare(ownerStats, { ...aiStats, avgWords: 3.5, tanglishShare: 2, lowerStartShare: 4 }).match;
  assert.ok(closer > real + 25, `closing the gaps raises the score (got ${closer})`);
  assert.equal(compare(ownerStats, ownerStats).match, 100);
});

test('style check: check-ins are compared with how you start chats and get their own fixes', () => {
  const { summarize } = require('../services/styleCompare');
  const replies = { ...ownerStats, count: 500 };
  const openers = { ...ownerStats, count: 40 };
  const checkIns = { ...aiStats, count: 40 };
  const s = summarize(ownerStats, replies, checkIns, openers);
  assert.equal(s.replyMatch, 100);
  assert.equal(s.replyFixes.length, 0);
  assert.ok(s.checkInFixes.some(f => /Tanglish/.test(f)));
  assert.ok(s.diffs.every(d => d.key.startsWith('checkin_')));
  assert.match(s.diffs[0].text, /^In check-ins, compared with how you start chats: /);
  assert.ok(s.match < 100 && s.match > s.checkInMatch, 'headline weighs replies and check-ins by count');
  // Your openers are longer than your replies: check-ins are held to the openers, not to "3 words"
  const longOpeners = { ...ownerStats, count: 40, avgWords: 5, medianWords: 5, lowerStartShare: 45, tanglishShare: 10, emojiShare: 20, questionShare: 3 };
  const fair = summarize(ownerStats, replies, checkIns, longOpeners);
  assert.equal(fair.checkInFixes.length, 0);
  assert.equal(fair.checkInMatch, 100);
  // Not enough check-ins, or not enough of your own openers: no check-in rules at all
  assert.equal(summarize(ownerStats, replies, { ...checkIns, count: 3 }, openers).checkInMatch, null);
  const noOpeners = summarize(ownerStats, replies, checkIns, { ...openers, count: 4 });
  assert.equal(noOpeners.checkInMatch, null);
  assert.equal(noOpeners.checkInFixes.length, 0);
  assert.equal(noOpeners.match, 100);
});

test('style check: your openers are the first message after a quiet gap in each chat', () => {
  const { openerLines } = require('../services/styleCompare');
  const t = h => ({ timestamp: new Date(Date.UTC(2026, 10, 1, h)) });
  const msgs = [
    { role: 'assistant', recipientId: 'a', text: 'heyy machaa', ...t(1) },
    { role: 'user', senderId: 'a', text: 'yo', ...t(1) },
    { role: 'assistant', recipientId: 'a', text: 'nothing much', ...t(2) },
    { role: 'assistant', recipientId: 'a', text: 'did u finish the drawing', ...t(12) },
    { role: 'assistant', recipientId: 'b', text: 'Hola shorty', ...t(3) },
    { role: 'assistant', recipientId: 'b', text: 'AI check-in', sentByAI: true, isCheckIn: true, ...t(20) },
    { role: 'assistant', recipientId: 'test_sim', text: 'sandbox hi', ...t(5) },
  ];
  assert.deepEqual(openerLines(msgs).sort(), ['Hola shorty', 'did u finish the drawing', 'heyy machaa']);
});

test('checker self-test: trusted only if it passes your own messages and scores the AI lower', () => {
  const { verdictOf } = require('../services/voiceAudit');
  assert.equal(verdictOf({ realCount: 12, realPass: 92, realAvg: 84, aiCount: 12, aiAvg: 61 }).trusted, true);
  assert.equal(verdictOf({ realCount: 12, realPass: 60, realAvg: 70, aiCount: 12, aiAvg: 50 }).trusted, false);
  assert.equal(verdictOf({ realCount: 12, realPass: 95, realAvg: 80, aiCount: 12, aiAvg: 78 }).trusted, false);
  assert.equal(verdictOf({ realCount: 3, realPass: 100, realAvg: 90, aiCount: 3, aiAvg: 40 }).trusted, false);
});
