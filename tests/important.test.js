const test = require('node:test');
const assert = require('node:assert');
const { extractLinks, looksImportant, kindOf, cues } = require('../services/importantRules');

test('links are pulled out of a message', () => {
  assert.deepEqual(extractLinks('join here https://lichess.org/abc123. hurry'), ['https://lichess.org/abc123']);
  assert.deepEqual(extractLinks('meet.google.com/xyz-abcd-efg at 5'), ['meet.google.com/xyz-abcd-efg']);
  assert.deepEqual(extractLinks('no links here'), []);
});

test('important-looking messages go to the AI check, small talk does not', () => {
  assert.ok(looksImportant('can we play chess now?'));
  assert.ok(looksImportant('send me 500 on gpay pls'));
  assert.ok(looksImportant('urgent call me'));
  assert.ok(looksImportant('lets go for the movie tomorrow at 7'));
  assert.ok(looksImportant('lol', { hasAttachment: true }));
  assert.ok(!looksImportant('hahaha same'));
  assert.ok(!looksImportant('good night da'));
  assert.ok(cues('can we play chess now?').includes('invite'));
});

test('attachment kinds', () => {
  assert.equal(kindOf('image'), 'photo');
  assert.equal(kindOf('audio'), 'voice');
  assert.equal(kindOf('file'), 'file');
  assert.equal(kindOf('ig_reel'), 'reel');
  assert.equal(kindOf('share', 'https://instagram.com/reel/x'), 'reel');
});

test('a reply that says yes for the owner is caught; normal replies are not', () => {
  const { commitsOwner, holdingReply } = require('../services/importantRules');
  for (const r of ['sure', 'ok lets play', 'yes send the link', "i'll pay tmrw", 'omw', 'im in', 'Sure, let’s go!']) {
    assert.ok(commitsOwner(r), r);
  }
  for (const r of ['wait lemme see', 'haha', 'not today', 'what time?', 'surely not lol', 'okayish day']) {
    assert.ok(!commitsOwner(r), r);
  }
  assert.ok(!commitsOwner(holdingReply(0.1)));
});
