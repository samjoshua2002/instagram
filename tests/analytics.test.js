// Analytics activity route (charts on the analytics page). No database: model calls are stubbed.
// Run with `node --test tests/analytics.test.js`
const test = require('node:test');
const assert = require('node:assert/strict');

const Message = require('../models/Message');
const User = require('../models/User');
const analytics = require('../routes/analytics');

const { buildSeries, buildHeatmap } = analytics._test;
const activity = analytics.stack.find(l => l.route && l.route.path === '/activity').route.stack[0].handle;

async function call(query, user, facetOut = {}, users = []) {
  const saved = { agg: Message.aggregate, find: User.find };
  const seen = [];
  Message.aggregate = async pipeline => { seen.push(pipeline); return [facetOut]; };
  User.find = () => {
    const chain = { select: () => chain, lean: async () => users };
    return chain;
  };
  const out = { status: 200 };
  const res = { status(c) { out.status = c; return res; }, json(b) { out.body = b; return res; } };
  try {
    await activity({ query, user }, res);
  } finally {
    Message.aggregate = saved.agg;
    User.find = saved.find;
  }
  out.pipelines = seen;
  return out;
}

const OWNER = { _id: 'owner1', role: 'user' };
const ADMIN = { _id: 'admin1', role: 'superadmin' };

test('30 days gives 30 daily bars ending today, scoped to the owner', async () => {
  const { status, body, pipelines } = await call({ range: '30d', tzOffset: '-330' }, OWNER, {
    totals: [{ _id: 'received', n: 10 }, { _id: 'ai', n: 4 }, { _id: 'human', n: 1 }],
  });
  assert.equal(status, 200);
  assert.equal(body.bucket, 'day');
  assert.equal(body.series.length, 30);
  assert.deepEqual(body.totals, { received: 10, ai: 4, human: 1, total: 15 });
  const match = pipelines[0][0].$match;
  assert.equal(match.ownerId, 'owner1');
  assert.ok(match.createdAt.$gte instanceof Date);
  assert.equal(body.owners, undefined);
});

test('unknown range falls back to 30 days; 90 days is weekly; all time has no date filter', async () => {
  assert.equal((await call({ range: 'bogus' }, OWNER)).body.range, '30d');
  const ninety = await call({ range: '90d' }, OWNER);
  assert.equal(ninety.body.bucket, 'week');
  assert.equal(ninety.body.series.length, 13);
  const all = await call({ range: 'all' }, OWNER);
  assert.equal(all.pipelines[0][0].$match.createdAt, undefined);
  assert.equal(all.body.bucket, 'week');
});

test('platform scope is superadmin only', async () => {
  const denied = await call({ scope: 'platform' }, OWNER);
  assert.equal(denied.status, 403);
});

test('platform scope counts every workspace and names the busiest', async () => {
  const { status, body, pipelines } = await call({ scope: 'platform', range: '7d' }, ADMIN, {
    owners: [{ _id: 'u1', total: 9, received: 5, ai: 4 }, { _id: 'u2', total: 2, received: 2, ai: 0 }],
  }, [{ _id: 'u1', username: 'cafe', instagramUsername: 'cafe.ig', accountType: 'business', businessProfile: { businessName: 'Cafe' } }]);
  assert.equal(status, 200);
  assert.equal(pipelines[0][0].$match.ownerId, undefined);
  assert.equal(body.activeWorkspaces, 2);
  assert.equal(body.owners[0].username, 'cafe.ig');
  assert.equal(body.owners[0].name, 'Cafe');
  assert.equal(body.owners[1].username, 'deleted account');
  assert.equal(body.series.length, 7);
});

test('database errors return 500', async () => {
  const saved = Message.aggregate;
  Message.aggregate = async () => { throw new Error('down'); };
  const out = { status: 200 };
  const res = { status(c) { out.status = c; return res; }, json(b) { out.body = b; return res; } };
  try { await activity({ query: {}, user: OWNER }, res); } finally { Message.aggregate = saved; }
  assert.equal(out.status, 500);
});

test('buildSeries sums days into weeks from today backwards and trims empty leading weeks', () => {
  const days = Array.from({ length: 35 }, (_, i) => `d${String(i).padStart(2, '0')}`);
  const rows = [{ _id: { day: 'd34', kind: 'received' }, n: 3 }, { _id: { day: 'd30', kind: 'ai' }, n: 2 }];
  const { bucket, series } = buildSeries(days, rows, true);
  assert.equal(bucket, 'week');
  assert.equal(series.length, 4); // 5 weeks, empty ones trimmed down to the 4-bar minimum
  assert.deepEqual(series[3], { start: 'd28', end: 'd34', received: 3, ai: 2, human: 0 });
});

test('buildHeatmap puts Monday first and Sunday last', () => {
  const grid = buildHeatmap([{ _id: { dow: 2, hour: 9 }, n: 4 }, { _id: { dow: 1, hour: 23 }, n: 7 }]);
  assert.equal(grid[0][9], 4);
  assert.equal(grid[6][23], 7);
});
