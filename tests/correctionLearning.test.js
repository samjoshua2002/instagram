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
