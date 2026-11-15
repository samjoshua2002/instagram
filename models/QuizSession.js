const mongoose = require('mongoose');

/** One run of the texting-style quiz: your replies, the AI's guesses, scores, and the persona draft. */
const quizSessionSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['active', 'done'], default: 'active' },
  answers: [{
    itemId: String, from: String, text: String, answer: { type: String, default: '' }, skipped: { type: Boolean, default: false },
    aiGuess: { type: String, default: '' }, style: Number, meaning: Number, score: Number, note: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  }],
  draft: { type: mongoose.Schema.Types.Mixed, default: null },
  appliedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('QuizSession', quizSessionSchema);
