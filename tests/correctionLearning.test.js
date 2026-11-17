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
