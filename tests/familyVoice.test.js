const test = require('node:test');
const assert = require('node:assert');
const social = require('../services/socialGraphService');
const { rankSimilar, tokens } = require('../services/voiceService');

test('familyRole: real family labels map to a role, friend nicknames do not', () => {
  assert.equal(social.familyRole('Mother'), 'mother');
  assert.equal(social.familyRole('Amma'), 'mother');
  assert.equal(social.familyRole('Dad'), 'father');
  assert.equal(social.familyRole('elder bro'), 'brother');
  assert.equal(social.familyRole('Cousin'), 'cousin');
  assert.equal(social.familyRole('girlfriend'), 'partner');
  assert.equal(social.familyRole('Online Sister'), null);
  assert.equal(social.familyRole('Sister figure'), null);
  assert.equal(social.familyRole('Day-one Homie / Brother'), null);
  assert.equal(social.familyRole('college friend'), null);
  assert.equal(social.familyRole(''), null);
});

test('rankSimilar: picks your real replies to the most similar messages, skips this chat and repeats', () => {
  const ex = (them, me, contact) => ({ them: [them], me: [me], contact, keys: tokens(them) });
  const list = [
    ex('what is your mom name', 'sangeetha', 'a'),
    ex('how is your mom doing', 'shes good da', 'b'),
    ex('send the notes', 'ok wait', 'c'),
    ex('your mom cooks well', 'shes good da', 'd'),
    ex('what is your mom name', 'its sangeetha', 'me-now'),
  ];
  const out = rankSimilar(list, 'whats your mom name?', { exclude: 'me-now' });
  assert.equal(out[0].me[0], 'sangeetha');
  assert.ok(!out.some(e => e.contact === 'me-now'));
  assert.equal(out.filter(e => e.me[0] === 'shes good da').length, 1);
  assert.ok(!out.some(e => e.me[0] === 'ok wait'));
  assert.deepEqual(rankSimilar(list, 'hi'), []);
});
