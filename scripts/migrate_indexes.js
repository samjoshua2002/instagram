/**
 * One-off index migration for UserMemory (not run automatically).
 *
 *   node scripts/migrate_indexes.js --dry-run   # only prints what it would do
 *   node scripts/migrate_indexes.js             # applies the changes
 *
 * 1. Drops the old global unique index on senderId (senderId_1), which stopped two workspaces
 *    from having the same contact, and recreates it as a plain (non-unique) index.
 * 2. Drops the old partial ownerId_1_senderId_1 index (it ignored ownerless rows).
 * 3. Creates the unique { ownerId, senderId } index, after checking there are no duplicates.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const DRY_RUN = process.argv.includes('--dry-run');
const log = (...a) => console.log(DRY_RUN ? '[dry-run]' : '[apply]', ...a);

async function main() {
  const uri = (process.env.MONGODB_URI || '').trim().replace(/^["']|["']$/g, '');
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, autoIndex: false });
  const col = mongoose.connection.db.collection('usermemories');

  const indexes = await col.indexes();
  log('Current indexes:', indexes.map(i => `${i.name}${i.unique ? ' (unique)' : ''}${i.partialFilterExpression ? ' (partial)' : ''}`).join(', '));

  const senderIdx = indexes.find(i => i.name === 'senderId_1');
  if (senderIdx && senderIdx.unique) {
    log('Drop unique index senderId_1 and recreate it as a non-unique index');
    if (!DRY_RUN) {
      await col.dropIndex('senderId_1');
      await col.createIndex({ senderId: 1 }, { name: 'senderId_1' });
    }
  } else if (!senderIdx) {
    log('Create non-unique index senderId_1');
    if (!DRY_RUN) await col.createIndex({ senderId: 1 }, { name: 'senderId_1' });
  } else {
    log('senderId_1 is already non-unique: nothing to do');
  }

  const compound = indexes.find(i => i.name === 'ownerId_1_senderId_1');
  const compoundOk = compound && compound.unique && !compound.partialFilterExpression;
  if (compound && !compoundOk) {
    log('Drop old ownerId_1_senderId_1 index (partial or not unique)');
    if (!DRY_RUN) await col.dropIndex('ownerId_1_senderId_1');
  }

  if (!compoundOk) {
    const dups = await col.aggregate([
      { $group: { _id: { ownerId: '$ownerId', senderId: '$senderId' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $limit: 20 },
    ]).toArray();
    if (dups.length) {
      console.error('Duplicate { ownerId, senderId } pairs found; merge or delete them first:');
      dups.forEach(d => console.error(`  ownerId=${d._id.ownerId} senderId=${d._id.senderId} count=${d.n}`));
      process.exitCode = 1;
    } else {
      log('Create unique index ownerId_1_senderId_1 on { ownerId: 1, senderId: 1 }');
      if (!DRY_RUN) await col.createIndex({ ownerId: 1, senderId: 1 }, { unique: true, name: 'ownerId_1_senderId_1' });
    }
  } else {
    log('ownerId_1_senderId_1 is already a full unique index: nothing to do');
  }
}

main()
  .catch(err => { console.error('Migration failed:', err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
