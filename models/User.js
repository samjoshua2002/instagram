const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  profilePicUrl: {
    type: String,
    default: '',
  },
  firstName: {
    type: String,
    default: '',
    trim: true,
  },
  lastName: {
    type: String,
    default: '',
    trim: true,
  },
  mobileNumber: {
    type: String,
    default: '',
    trim: true,
  },
  whatsappNumber: {
    type: String,
    default: '',
    trim: true,
  },
  instagramUsername: {
    type: String,
    default: 'catovidz',
    trim: true,
  },
  accountType: {
    type: String,
    enum: ['personal', 'creator', 'business', 'agency'],
    default: 'personal',
  },
  address: {
    street: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    country: { type: String, default: '' },
    postalCode: { type: String, default: '' },
  },
  twoFactor: {
    enabled: { type: Boolean, default: true },
    secret: { type: String, default: '' },
    backupCodes: [{ type: String }],
  },
  passkeys: [{
    credentialId: { type: String, required: true },
    publicKey: { type: String, required: true },
    counter: { type: Number, default: 0 },
    transports: [{ type: String }],
    deviceType: { type: String, default: 'singleDevice' },
    backedUp: { type: Boolean, default: false },
    name: { type: String, default: 'My Passkey' },
    createdAt: { type: Date, default: Date.now },
  }],
  currentChallenge: {
    type: String,
    default: '',
  },
  resetOtp: {
    code: { type: String, default: '' },
    expiresAt: { type: Date, default: null },
  },
  lastLogin: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

UserSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

UserSchema.statics.hashPassword = async function(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

module.exports = mongoose.model('User', UserSchema);
