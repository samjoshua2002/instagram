// Home dashboard summary route. No database: model calls are stubbed. Run with `node --test tests/home.test.js`
const test = require('node:test');
const assert = require('node:assert/strict');

const Message = require('../models/Message');
const UserMemory = require('../models/UserMemory');
const home = require('../routes/home');

const { parseTzOffset, tzString, localDay } = home._test;
const summary = home.stack.find(l => l.route && l.route.path === '/summary').route.stack[0].handle;

// Calls the handler with a fake req/res and returns { status, body }
async function call(query, user, stubs) {
  const saved = { agg: Message.aggregate, count: UserMemory.countDocuments, find: UserMemory.find };
  const seen = [];
  Message.aggregate = async pipeline => {
    seen.push(pipeline[0].$match);
    if (stubs.fail) throw new Error('database down');
    return pipeline[0].$match.role === 'assistant' ? stubs.replies || [] : stubs.senders || [];
  };
  UserMemory.countDocuments = async () => (stubs.handoffs || []).length;
  UserMemory.find = () => {
    const chain = { sort: () => chain, limit: () => chain, select: () => chain, lean: async () => stubs.handoffs || [] };
    return chain;
  };
  const out = { status: 200 };
  const res = { status(c) { out.status = c; return res; }, json(b) { out.body = b; return res; } };
  try {
    await summary({ query, user }, res);
  } finally {
    Message.aggregate = saved.agg;
    UserMemory.countDocuments = saved.count;
    UserMemory.find = saved.find;
  }
  out.matches = seen;
  return out;
}

const USER = { _id: 'owner1', instagram: {} };

test('home: tz offset parsing and Mongo timezone string', () => {
  assert.equal(parseTzOffset('-330'), -330);
  assert.equal(parseTzOffset('abc'), 0);
  assert.equal(parseTzOffset('2000'), 0);
  assert.equal(parseTzOffset('1.5'), 0);
  assert.equal(tzString(-330), '+05:30');
  assert.equal(tzString(300), '-05:00');
  assert.equal(tzString(0), '+00:00');
  // 20:00Z on 5 Nov is already 6 Nov in IST
  assert.equal(localDay(Date.parse('2026-11-05T20:00:00Z'), -330), '2026-11-06');
  assert.equal(localDay(Date.parse('2026-11-05T20:00:00Z'), 0), '2026-11-05');
});

test('home: replies split into AI/human buckets, today and week totals', async () => {
  const now = Date.now();
  const today = localDay(now, -330);
  const eightDaysAgo = localDay(now - 8 * 864e5, -330);
  const { status, body, matches } = await call({ tzOffset: '-330' }, USER, {
    replies: [
      { _id: { day: today, ai: true }, n: 3 },
      { _id: { day: today, ai: false }, n: 1 },
      { _id: { day: eightDaysAgo, ai: true }, n: 2 },
      { _id: { day: '1999-01-01', ai: true }, n: 50 }, // outside the window: ignored
    ],
  });
  assert.equal(status, 200);
  assert.equal(body.days.length, 14);
  assert.equal(body.days[13], today);
  assert.deepEqual(body.replies.today, { ai: 3, human: 1 });
  assert.deepEqual(body.replies.thisWeek, { ai: 3, human: 1 });
  assert.deepEqual(body.replies.lastWeek, { ai: 2, human: 0 });
  assert.deepEqual(body.aiShare, { thisWeek: 75, lastWeek: 100 });
  // Every query is scoped to the signed-in owner
  assert.ok(matches.every(m => m.ownerId === 'owner1'));
});

test('home: no replies gives null AI share, people counted once per week', async () => {
  const now = Date.now();
  const d = n => localDay(now - n * 864e5, 0);
  const { body } = await call({}, USER, {
    senders: [
      { _id: 'a', days: [d(0), d(1)] }, // this week only, two days
      { _id: 'b', days: [d(2), d(9)] }, // both weeks
      { _id: 'c', days: [d(10)] }, // last week only
    ],
  });
  assert.deepEqual(body.aiShare, { thisWeek: null, lastWeek: null });
  assert.equal(body.people.thisWeek, 2);
  assert.equal(body.people.lastWeek, 2);
  assert.equal(body.people.daily[13], 1);
  assert.equal(body.people.daily[12], 1);
});

test('home: handoffs carry wait minutes; Instagram health', async () => {
  const requestedAt = new Date(Date.now() - 90 * 60000);
  const user = { _id: 'owner1', instagram: { accessTokenEncrypted: 'x', tokenExpiresAt: new Date(Date.now() + 10 * 864e5) } };
  const { body } = await call({}, user, {
    handoffs: [{ senderId: 's1', name: 'Asha', handoffRequestedAt: requestedAt, handoffReason: 'price' }],
  });
  assert.equal(body.handoffs.total, 1);
  assert.equal(body.handoffs.items[0].senderId, 's1');
  assert.equal(body.handoffs.items[0].username, '');
  assert.ok(body.handoffs.items[0].waitingMinutes >= 89 && body.handoffs.items[0].waitingMinutes <= 90);
  assert.equal(body.instagram.connected, true);
  assert.equal(body.instagram.status, 'amber');
  assert.ok(body.instagram.daysLeft >= 9 && body.instagram.daysLeft <= 10);

  const off = await call({}, USER, {});
  assert.equal(off.body.instagram.connected, false);
  assert.equal(off.body.instagram.status, 'red');
});

test('home: database error returns 500', async () => {
  const origErr = console.error;
  console.error = () => {};
  try {
    const out = await call({}, USER, { fail: true });
    assert.equal(out.status, 500);
    assert.equal(out.body.error, 'Could not load the home summary');
  } finally {
    console.error = origErr;
  }
});
