const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  senderId: {
    type: String,
    required: true,
    index: true,
  },
  recipientId: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  mid: {
    type: String,
  },
  sentByAI: {
    type: Boolean,
    default: false,
  },
  isReminder: {
    type: Boolean,
    default: false,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

// Fast per-creator conversation lookups (inbox, history, reply context)
MessageSchema.index({ ownerId: 1, senderId: 1, createdAt: -1 });
MessageSchema.index({ ownerId: 1, recipientId: 1, createdAt: -1 });

// One copy of each Instagram message per creator (Instagram's echo of a sent message reuses its id)
MessageSchema.index({ ownerId: 1, mid: 1 }, { unique: true, partialFilterExpression: { mid: { $type: 'string' } } });

/**
 * Save a message once. If the same message id is already stored (e.g. the echo arrived first),
 * `update` fields are merged into it instead of failing with a duplicate-key error.
 * Returns { inserted: boolean }.
 */
MessageSchema.statics.record = async function(doc, { update = {} } = {}) {
  if (!doc.mid) {
    await this.create(doc);
    return { inserted: true };
  }
  const { mid, ownerId } = doc;
  const insertOnly = { ...doc };
  for (const k of Object.keys(update)) delete insertOnly[k];
  try {
    const r = await this.updateOne(
      { ownerId, mid },
      { $setOnInsert: insertOnly, ...(Object.keys(update).length ? { $set: update } : {}) },
      { upsert: true, setDefaultsOnInsert: true }
    );
    return { inserted: Boolean(r.upsertedCount) };
  } catch (err) {
    if (err && err.code === 11000) {
      if (Object.keys(update).length) await this.updateOne({ ownerId, mid }, { $set: update });
      return { inserted: false };
    }
    throw err;
  }
};

module.exports = mongoose.model('Message', MessageSchema);
