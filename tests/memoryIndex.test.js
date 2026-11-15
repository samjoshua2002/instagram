const test = require('node:test');
const assert = require('node:assert');
const { buildChunks, batchChunks, brainScore, searchTerms } = require('../services/memoryIndexRules');

const t0 = Date.parse('2026-11-01T10:00:00Z');
const msg = (min, role, text, sentByAI = false) => ({ timestamp: new Date(t0 + min * 60000), role, text, sentByAI });

test('chunks: real messages only, split on 30-minute gaps, tagged by who wrote them', () => {
  const chunks = buildChunks([
    msg(0, 'user', 'hey'), msg(1, 'assistant', 'yo'), msg(2, 'assistant', 'ai reply', true),
    msg(90, 'user', 'exam tmrw'), msg(91, 'assistant', 'all the best'),
  ]);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].text, 'them: hey\nme: yo');
  assert.ok(!chunks.some(c => c.text.includes('ai reply')));
  assert.equal(chunks[1].messages, 2);
});

test('batches stay under the size limit', () => {
  const chunks = Array.from({ length: 50 }, (_, i) => ({ startAt: new Date(t0), text: 'x'.repeat(1000) }));
  const b = batchChunks(chunks, 5000);
  assert.ok(b.length >= 10);
  assert.ok(b.every(x => x.length <= 6200));
});

test('brain score grows with what is known and is capped by little history', () => {
  const full = { identity: 3, bond: 3, howWeTalk: 3, interests: 3, workStudy: 3, people: 3, places: 3, timeline: 3, routines: 3, insideJokes: 3, preferences: 3, openThreads: 3 };
  assert.equal(brainScore(full, 5000), 100);
  assert.equal(brainScore(full, 10), 25);
  assert.equal(brainScore({}, 5000), 0);
  assert.ok(brainScore({ bond: 2, howWeTalk: 2 }, 5000) > 0);
});

test('search terms skip filler words', () => {
  assert.deepEqual(searchTerms('what is your mom name bro'), ['mom', 'name']);
});

test('a cut emoji is removed so the text is valid JSON', () => {
  const { wellFormed } = require('../services/memoryIndexRules');
  const cut = '😂😂'.slice(0, 3);
  assert.equal(wellFormed(cut), '😂');
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(wellFormed(`hi ${cut}`))));
});

test('overall index score: share read and brain weighted by chat size', () => {
  const { overallScore } = require('../services/memoryIndexRules');
  const o = overallScore([{ totalMessages: 900, indexedMessages: 900, brainScore: 80, status: 'ready' }, { totalMessages: 100, indexedMessages: 0, brainScore: 0, status: 'pending' }]);
  assert.equal(o.indexedPct, 90);
  assert.equal(o.brain, 72);
  assert.equal(o.ready, 1);
});
