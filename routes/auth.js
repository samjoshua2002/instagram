const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const authService = require('../services/authService');

// --- Small helpers ---------------------------------------------------------

// Secure 6-digit OTP
const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

// Coerce an OTP code (may arrive as number) to a trimmed string, or '' if invalid type
const cleanOtpInput = (v) => (typeof v === 'string' || typeof v === 'number') ? String(v).trim() : '';

const MAX_OTP_ATTEMPTS = 5;

/**
 * Checks an OTP sub-document ('verificationOtp' | 'resetOtp') against the supplied code.
 * Counts wrong attempts, invalidates after MAX_OTP_ATTEMPTS, and clears the code on success.
 * Returns null on success, or { status, error } on failure. Caller must save the user on success.
 */
async function checkOtp(user, field, code, messages = {}) {
  const otp = user && user[field];
  if (!otp || !otp.code) {
    return { status: 400, error: messages.missing || 'Invalid or expired verification request' };
  }
  if (!otp.expiresAt || new Date() > new Date(otp.expiresAt)) {
    user[field] = { code: '', expiresAt: null, attempts: 0 };
    await user.save();
    return { status: 400, error: messages.expired || 'Verification code has expired. Please request a new one.' };
  }
  const a = Buffer.from(String(otp.code));
  const b = Buffer.from(String(code || ''));
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    const attempts = (otp.attempts || 0) + 1;
    if (attempts >= MAX_OTP_ATTEMPTS) {
      user[field] = { code: '', expiresAt: null, attempts: 0 };
      await user.save();
      return { status: 400, error: 'Too many attempts, request a new code' };
    }
    user[field] = { code: otp.code, expiresAt: otp.expiresAt, attempts };
    await user.save();
    return { status: 400, error: messages.invalid || 'Invalid verification code' };
  }
  // Success: OTP is single-use
  user[field] = { code: '', expiresAt: null, attempts: 0 };
  return null;
}

// Tiny in-memory rate limiter (per IP + route), no dependency
const rateBuckets = new Map();
const rateLimit = (max = 20, windowMs = 10 * 60 * 1000) => (req, res, next) => {
  const now = Date.now();
  const key = `${req.ip || req.socket?.remoteAddress || 'unknown'}|${req.baseUrl || ''}${req.route?.path || req.path}`;
  let bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > max) {
    res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });
  }
  next();
};
const authLimiter = rateLimit(20, 10 * 60 * 1000);
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateBuckets) if (now > v.resetAt) rateBuckets.delete(k);
  for (const [k, v] of passkeyChallenges) if (now > v.expiresAt) passkeyChallenges.delete(k);
}, 60 * 1000).unref();

// Server-side store for passkey LOGIN challenges (keyed by the challenge itself, 5-minute expiry)
const passkeyChallenges = new Map();
const PASSKEY_CHALLENGE_TTL = 5 * 60 * 1000;

// Escape a value for safe use inside HTML markup
const escapeHtml = (v) => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// JSON-encode a value for safe embedding inside an inline <script>
const jsonForScript = (v) => JSON.stringify(v === undefined ? null : v)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

// OAuth origin allow-list
const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3998'];
function getAllowedOrigins() {
  const fromEnv = (process.env.FRONTEND_ORIGINS || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
  return Array.from(new Set([...fromEnv, ...DEFAULT_ALLOWED_ORIGINS]));
}
function resolveAllowedOrigin(raw) {
  const allowed = getAllowedOrigins();
  if (typeof raw === 'string' && raw) {
    try {
      const u = new URL(raw);
      const normalized = `${u.protocol}//${u.host}`;
      if (allowed.includes(normalized)) return normalized;
      if (u.protocol === 'https:' && /\.vercel\.app$/i.test(u.hostname)) return normalized;
    } catch (e) {}
  }
  return allowed[0];
}

// Public user shape (includes both id and _id)
function serializeUser(user, extra = {}) {
  const isSuper = user.role === 'superadmin';
  return {
    id: user._id,
    _id: user._id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    mobileNumber: user.mobileNumber,
    whatsappNumber: user.whatsappNumber,
    instagramUsername: user.instagramUsername,
    instagramId: user.instagramId || '',
    role: isSuper ? 'superadmin' : 'user',
    accountType: user.accountType,
    isOnboarded: user.isOnboarded ?? false,
    businessProfile: user.businessProfile || null,
    profilePicUrl: user.profilePicUrl || '',
    hasPasskeys: (user.passkeys || []).length > 0,
    hasInstagramToken: Boolean(user.instagramPageAccessToken),
    isInstagramConnected: Boolean(user.instagramPageAccessToken),
    ...extra,
  };
}

// Middleware to protect routes with JWT Bearer Token
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = authService.verifyToken(token);
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
    }
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Authentication error' });
  }
};

/**
 * POST /api/auth/register/request-otp
 * Step 1: Validate registration details and dispatch 6-digit email verification OTP
 */
router.post('/register/request-otp', authLimiter, async (req, res) => {
  try {
    const {
      email,
      username,
      password,
      firstName,
      lastName,
      mobileNumber,
      whatsappNumber,
      instagramUsername,
      instagramId,
    } = req.body || {};

    const optionalFields = { firstName, lastName, mobileNumber, whatsappNumber, instagramUsername, instagramId };
    if (typeof email !== 'string' || typeof username !== 'string' || typeof password !== 'string' ||
        Object.values(optionalFields).some(v => v !== undefined && v !== null && typeof v !== 'string')) {
      return res.status(400).json({ error: 'Invalid registration details.' });
    }

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!username || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
    const cleanIgHandle = (instagramUsername || '').trim().replace(/^@/, '').toLowerCase();

    // Check if account already exists
    const existing = await User.findOne({
      $or: [{ email: cleanEmail }, { username: cleanUsername }]
    });

    if (cleanUsername.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters.' });
    }

    if (existing && existing.isVerified !== false && existing.email === cleanEmail) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    }
    // Only an UNVERIFIED record with the SAME email may be overwritten
    if (existing && existing.email !== cleanEmail) {
      return res.status(409).json({ error: 'This username is already taken. Please choose another.' });
    }
    if (existing) {
      const usernameOwner = await User.findOne({ username: cleanUsername, _id: { $ne: existing._id } });
      if (usernameOwner) {
        return res.status(409).json({ error: 'This username is already taken. Please choose another.' });
      }
    }

    // Check if Instagram handle is already registered by another verified user
    if (cleanIgHandle) {
      const existingIg = await User.findOne({
        instagramUsername: cleanIgHandle,
        isVerified: { $ne: false },
        email: { $ne: cleanEmail }
      });
      if (existingIg) {
        return res.status(409).json({ error: `The Instagram handle @${cleanIgHandle} is already registered to another Chatter OS account. Please choose your own handle or sign in.` });
      }
    }

    // Generate 6-digit OTP
    const otpCode = generateOtp();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const passwordHash = await User.hashPassword(password);
    const totpSecret = authService.generateTotpSecret();

    let user = existing;
    if (!user) {
      user = new User({
        email: cleanEmail,
        username: cleanUsername,
        passwordHash,
        firstName: (firstName || '').trim(),
        lastName: (lastName || '').trim(),
        mobileNumber: (mobileNumber || '').trim(),
        whatsappNumber: (whatsappNumber || '').trim(),
        instagramUsername: cleanIgHandle || '',
        instagramId: (instagramId || '').trim(),
        role: 'user',
        isVerified: false,
        verificationOtp: {
          code: otpCode,
          expiresAt: otpExpires,
          attempts: 0,
        },
        twoFactor: {
          enabled: true,
          secret: totpSecret,
        },
      });
    } else {
      user.username = cleanUsername;
      user.passwordHash = passwordHash;
      user.firstName = (firstName || '').trim();
      user.lastName = (lastName || '').trim();
      user.mobileNumber = (mobileNumber || '').trim();
      user.whatsappNumber = (whatsappNumber || '').trim();
      user.instagramUsername = cleanIgHandle || user.instagramUsername || '';
      if (instagramId) user.instagramId = instagramId.trim();
      user.role = existing.role || 'user';
      user.isVerified = false;
      user.verificationOtp = {
        code: otpCode,
        expiresAt: otpExpires,
        attempts: 0,
      };
      if (!user.twoFactor?.secret) {
        user.twoFactor = {
          enabled: true,
          secret: totpSecret,
        };
      }
    }

    await user.save();

    // Send verification email
    try {
      const sendResult = await authService.sendOtpEmail(cleanEmail, otpCode, 'Account Verification');
      const targetMsg = sendResult.forwarded
        ? `A 6-digit verification code was sent to ${sendResult.deliveredTo} (Resend sandbox for ${cleanEmail}).`
        : `A 6-digit verification code was sent to ${cleanEmail}. Please check your inbox.`;
      res.json({
        success: true,
        message: targetMsg,
        email: cleanEmail,
      });
    } catch (mailErr) {
      console.error('❌ [Register OTP] Email sending failed:', mailErr.message);
      return res.status(503).json({ error: 'Could not send the verification email right now. Please try again later.' });
    }
  } catch (err) {
    console.error('❌ Registration Request OTP error:', err.message);
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'This username or email is already taken.' });
    }
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

/**
 * POST /api/auth/register/resend-otp
 * Resend OTP to email address for pending unverified accounts
 */
router.post('/register/resend-otp', authLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!isNonEmptyString(email)) {
      return res.status(400).json({ error: 'Email is required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const genericResponse = {
      success: true,
      message: `If a pending account exists for ${cleanEmail}, a fresh 6-digit verification code has been sent. Please check your inbox.`,
      email: cleanEmail,
    };
    const user = await User.findOne({ email: cleanEmail });
    if (!user || user.isVerified !== false) {
      return res.json(genericResponse);
    }

    const otpCode = generateOtp();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.verificationOtp = {
      code: otpCode,
      expiresAt: otpExpires,
      attempts: 0,
    };
    await user.save();

    try {
      await authService.sendOtpEmail(cleanEmail, otpCode, 'Account Verification');
    } catch (mailErr) {
      console.error('❌ [Resend OTP] Email sending failed:', mailErr.message);
      return res.status(503).json({ error: 'Could not send the verification email right now. Please try again later.' });
    }

    return res.json(genericResponse);
  } catch (err) {
    console.error('❌ Resend OTP error:', err.message);
    res.status(500).json({ error: 'Could not resend the verification code. Please try again.' });
  }
});

/**
 * POST /api/auth/register/verify-otp
 * Step 1.5: Confirm OTP, mark account as verified, and return authenticated session
 */
router.post('/register/verify-otp', authLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    const otpCode = cleanOtpInput((req.body || {}).otpCode);
    if (typeof email !== 'string') {
      return res.status(400).json({ error: 'Email and 6-digit verification code are required.' });
    }
    if (!email.trim() || !otpCode) {
      return res.status(400).json({ error: 'Email and 6-digit verification code are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    const otpErr = await checkOtp(user, 'verificationOtp', otpCode, {
      missing: 'No pending verification request found for this email.',
      expired: 'Verification code expired. Please request a new code.',
      invalid: 'Invalid 6-digit verification code.',
    });
    if (otpErr) {
      return res.status(otpErr.status).json({ error: otpErr.error });
    }

    user.isVerified = true;
    user.lastLogin = new Date();
    await user.save();

    const token = authService.generateToken(user);

    res.json({
      success: true,
      token,
      message: 'Account verified successfully!',
      user: serializeUser(user),
    });
  } catch (err) {
    console.error('❌ Registration Verify OTP error:', err.message);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

/**
 * POST /api/auth/login
 * Standard login: Direct password verification.
 * (OneAuth / TOTP is an alternative login method, NOT enforced on password login)
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { identifier, password, totpCode } = req.body || {};
    if ((identifier !== undefined && identifier !== null && typeof identifier !== 'string') ||
        (password !== undefined && password !== null && typeof password !== 'string') ||
        (totpCode !== undefined && totpCode !== null && typeof totpCode !== 'string' && typeof totpCode !== 'number')) {
      return res.status(400).json({ error: 'Invalid login request' });
    }
    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ error: 'Email or Username is required' });
    }

    // If totpCode is provided without password, route to OneAuth passwordless login
    if (!password && totpCode) {
      return await handleOneAuthDirectLogin(req, res, identifier, totpCode);
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const cleanIdentifier = identifier.trim().toLowerCase();
    const user = await User.findOne({
      $or: [{ email: cleanIdentifier }, { username: cleanIdentifier }]
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.isVerified === false) {
      return res.status(403).json({ error: 'Please verify your email first.', needsVerification: true, email: user.email });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = authService.generateToken(user);

    res.json({
      success: true,
      token,
      user: serializeUser(user),
    });
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

/**
 * Helper to execute direct Zoho OneAuth login
 */
async function handleOneAuthDirectLogin(req, res, identifier, code) {
  if (typeof identifier !== 'string' || (typeof code !== 'string' && typeof code !== 'number')) {
    return res.status(400).json({ error: 'Email/Username and 6-digit OneAuth code are required' });
  }
  const cleanIdentifier = identifier.trim().toLowerCase();
  const cleanCode = (code || '').toString().trim();

  if (!cleanCode || !/^\d{6}$/.test(cleanCode)) {
    return res.status(400).json({ error: 'Please enter the 6-digit verification code from your Zoho OneAuth app' });
  }

  const user = await User.findOne({
    $or: [{ email: cleanIdentifier }, { username: cleanIdentifier }]
  });

  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  if (!user.twoFactor?.secret) {
    return res.status(400).json({
      error: 'Zoho OneAuth is not configured on this account yet. Please log in with password or passkey first to scan the QR code.',
      needsSetup: true,
    });
  }

  const isValidTotp = authService.verifyTotp(user, cleanCode);
  if (!isValidTotp) {
    return res.status(401).json({ error: 'Invalid or expired 6-digit code from Zoho OneAuth app. Please check your app and try again.' });
  }

  if (user.isVerified === false) {
    await user.save(); // persist TOTP replay step
    return res.status(403).json({ error: 'Please verify your email first.', needsVerification: true, email: user.email });
  }

  user.lastLogin = new Date();
  await user.save();

  const token = authService.generateToken(user);
  return res.json({
    success: true,
    token,
    user: serializeUser(user),
  });
}

/**
 * POST /api/auth/oneauth-login
 * Dedicated direct passwordless login using Zoho OneAuth 6-digit code
 */
router.post('/oneauth-login', authLimiter, async (req, res) => {
  try {
    const { identifier, code } = req.body || {};
    if (!identifier || !code) {
      return res.status(400).json({ error: 'Email/Username and 6-digit OneAuth code are required' });
    }
    return await handleOneAuthDirectLogin(req, res, identifier, code);
  } catch (err) {
    console.error('❌ OneAuth login error:', err.message);
    res.status(500).json({ error: 'OneAuth login failed. Please try again.' });
  }
});

/**
 * POST /api/auth/oneauth/request-setup-otp
 * Allows unauthenticated owner to verify identity via email OTP to retrieve Zoho OneAuth QR code
 */
router.post('/oneauth/request-setup-otp', authLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!isNonEmptyString(email)) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const genericMessage = `If an account exists for ${cleanEmail}, a 6-digit verification code has been sent to unlock OneAuth setup.`;
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.json({ success: true, message: genericMessage });
    }

    const otpCode = generateOtp();
    user.resetOtp = {
      code: otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
    };
    await user.save();

    try {
      await authService.sendOtpEmail(user.email, otpCode, 'Zoho OneAuth Setup');
    } catch (mailErr) {
      // Do not reveal account existence or mail configuration
      console.error('❌ [OneAuth Setup OTP] Email sending failed:', mailErr.message);
    }
    res.json({ success: true, message: genericMessage });
  } catch (err) {
    console.error('❌ Request OneAuth Setup OTP error:', err.message);
    res.status(500).json({ error: 'Could not process the request. Please try again.' });
  }
});

/**
 * POST /api/auth/oneauth/verify-setup-otp
 * Verifies email OTP and returns the QR code & secret to link Zoho OneAuth app
 */
router.post('/oneauth/verify-setup-otp', authLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    const otpCode = cleanOtpInput((req.body || {}).otpCode);
    if (!isNonEmptyString(email)) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!otpCode) {
      return res.status(400).json({ error: 'Invalid 6-digit verification code' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    const otpErr = await checkOtp(user, 'resetOtp', otpCode, {
      missing: 'Invalid or expired setup request',
      expired: 'Verification code expired. Please request a new one.',
      invalid: 'Invalid 6-digit verification code',
    });
    if (otpErr) {
      return res.status(otpErr.status).json({ error: otpErr.error });
    }

    if (!user.twoFactor?.secret) {
      user.twoFactor = user.twoFactor || {};
      user.twoFactor.secret = authService.generateTotpSecret();
      user.twoFactor.enabled = true;
    }
    await user.save();

    // Return QR code and secret
    const totpData = await authService.getTotpQrCode(user);
    res.json({
      success: true,
      ...totpData,
    });
  } catch (err) {
    console.error('❌ Verify OneAuth Setup OTP error:', err.message);
    res.status(500).json({ error: 'Could not verify the setup code. Please try again.' });
  }
});
;

/**
 * GET /api/auth/oneauth/qr (Protected)
 * Returns the QR code of the logged-in user only.
 * (Before login, use /oneauth/request-setup-otp → /oneauth/verify-setup-otp.)
 */
router.get('/oneauth/qr', requireAuth, async (req, res) => {
  try {
    const user = req.user;

    if (!user.twoFactor?.secret) {
      user.twoFactor = user.twoFactor || {};
      user.twoFactor.secret = authService.generateTotpSecret();
      user.twoFactor.enabled = true;
      await user.save();
    }

    const totpData = await authService.getTotpQrCode(user);
    res.json({
      success: true,
      email: user.email,
      username: user.username,
      ...totpData,
    });
  } catch (err) {
    console.error('❌ OneAuth QR error:', err.message);
    res.status(500).json({ error: 'Could not load the OneAuth QR code.' });
  }
});

/**
 * POST /api/auth/forgot-password/verify-oneauth
 * Reset password instantly using Zoho OneAuth code (bypasses email timeouts completely)
 */
router.post('/forgot-password/verify-oneauth', authLimiter, async (req, res) => {
  try {
    const { totpCode, newPassword } = req.body || {};
    const identifier = (req.body || {}).identifier ?? (req.body || {}).email;
    if (typeof identifier !== 'string' || typeof newPassword !== 'string' ||
        (typeof totpCode !== 'string' && typeof totpCode !== 'number')) {
      return res.status(400).json({ error: 'Username/Email, OneAuth code, and new password are required' });
    }
    if (!identifier.trim() || !totpCode || !newPassword) {
      return res.status(400).json({ error: 'Username/Email, OneAuth code, and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const cleanIdentifier = identifier.trim().toLowerCase();
    const user = await User.findOne({
      $or: [{ email: cleanIdentifier }, { username: cleanIdentifier }]
    });

    if (!user || !user.twoFactor?.secret) {
      return res.status(400).json({ error: 'OneAuth not configured for this account' });
    }

    const isValid = authService.verifyTotp(user, totpCode);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid 6-digit OneAuth code. Check your app and try again.' });
    }

    user.passwordHash = await User.hashPassword(newPassword);
    await user.save();

    res.json({ success: true, message: 'Password reset successfully! You can now log in.' });
  } catch (err) {
    console.error('❌ OneAuth password reset error:', err.message);
    res.status(500).json({ error: 'Password reset failed. Please try again.' });
  }
});

/**
 * POST /api/auth/forgot-password/send-otp
 * Generates and sends a 6-digit OTP code to Sam's email
 */
router.post('/forgot-password/send-otp', authLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!isNonEmptyString(email)) return res.status(400).json({ error: 'Email is required' });

    const cleanEmail = email.trim().toLowerCase();
    const genericMessage = 'If this email exists, a verification code has been sent.';
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.json({ success: true, message: genericMessage });
    }

    // Generate secure 6-digit OTP
    const otpCode = generateOtp();
    user.resetOtp = {
      code: otpCode,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      attempts: 0,
    };
    await user.save();

    // Send verification email
    try {
      await authService.sendOtpEmail(user.email, otpCode, 'Password Reset');
    } catch (mailErr) {
      // Do not reveal account existence or mail configuration
      console.error('❌ [Password Reset OTP] Email delivery failed:', mailErr.message);
    }
    res.json({
      success: true,
      message: genericMessage
    });
  } catch (err) {
    console.error('❌ Send OTP error:', err.message);
    res.status(500).json({ error: 'Error generating password reset code' });
  }
});

/**
 * POST /api/auth/forgot-password/verify-reset
 * Verifies OTP and updates user password
 */
router.post('/forgot-password/verify-reset', authLimiter, async (req, res) => {
  try {
    const { email, newPassword } = req.body || {};
    const otpCode = cleanOtpInput((req.body || {}).otpCode);
    if (typeof email !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'Email, OTP code, and new password are required' });
    }
    if (!email.trim() || !otpCode || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP code, and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });
    const otpErr = await checkOtp(user, 'resetOtp', otpCode, {
      missing: 'Invalid or expired verification request',
      expired: 'Verification code has expired. Please request a new one.',
      invalid: 'Invalid verification code',
    });
    if (otpErr) {
      return res.status(otpErr.status).json({ error: otpErr.error });
    }

    user.passwordHash = await User.hashPassword(newPassword);
    await user.save();

    res.json({ success: true, message: 'Password reset successfully! You can now log in.' });
  } catch (err) {
    console.error('❌ Verify Reset error:', err.message);
    res.status(500).json({ error: 'Password reset failed. Please try again.' });
  }
});

/**
 * GET /api/auth/passkey/login-options
 * Generates WebAuthn options for Passkey / Fingerprint login.
 * The challenge is stored server-side (in-memory, 5 min), never on the user document.
 */
router.get('/passkey/login-options', authLimiter, async (req, res) => {
  try {
    const rawQuery = req.query.email || req.query.identifier || '';
    if (typeof rawQuery !== 'string') {
      return res.status(400).json({ error: 'Invalid identifier' });
    }
    const rawId = rawQuery.trim().toLowerCase();
    let user = null;
    if (rawId) {
      user = await User.findOne({
        $or: [{ email: rawId }, { username: rawId }]
      });
    }
    const options = await authService.generatePasskeyAuthenticationOptions(user, req);
    passkeyChallenges.set(options.challenge, {
      userId: user ? user._id.toString() : null,
      expiresAt: Date.now() + PASSKEY_CHALLENGE_TTL,
    });
    res.json(options);
  } catch (err) {
    console.error('❌ Passkey login options error:', err.message);
    res.status(500).json({ error: 'Could not start passkey login.' });
  }
});

/**
 * POST /api/auth/passkey/login-verify
 * Verifies biometric assertion and logs user in
 */
router.post('/passkey/login-verify', authLimiter, async (req, res) => {
  try {
    const { response } = req.body || {};
    if (!response || typeof response !== 'object' || typeof response.id !== 'string' ||
        typeof response.response?.clientDataJSON !== 'string') {
      return res.status(400).json({ error: 'Assertion response is required' });
    }

    // Look up the challenge from the signed clientDataJSON
    let challenge = '';
    try {
      const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8'));
      challenge = typeof clientData.challenge === 'string' ? clientData.challenge : '';
    } catch (e) {}
    const stored = challenge ? passkeyChallenges.get(challenge) : null;
    if (!stored || Date.now() > stored.expiresAt) {
      if (challenge) passkeyChallenges.delete(challenge);
      return res.status(400).json({ error: 'Passkey challenge expired. Please try again.' });
    }
    passkeyChallenges.delete(challenge); // single-use

    // Find the user by the credential id
    const user = await User.findOne({ 'passkeys.credentialId': response.id });
    if (!user || (stored.userId && stored.userId !== user._id.toString())) {
      return res.status(404).json({ error: 'No user registered with this passkey' });
    }

    let verified = false;
    try {
      verified = await authService.verifyPasskeyAuthentication(user, response, req, challenge);
    } catch (verifyErr) {
      return res.status(401).json({ error: 'Passkey verification failed' });
    }
    if (!verified) {
      return res.status(401).json({ error: 'Passkey verification failed' });
    }

    const token = authService.generateToken(user);
    const isSuper = user.role === 'superadmin';

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicUrl: user.profilePicUrl,
        mobileNumber: user.mobileNumber,
        whatsappNumber: user.whatsappNumber,
        instagramUsername: user.instagramUsername,
        instagramId: user.instagramId || '',
        role: isSuper ? 'superadmin' : 'user',
        accountType: user.accountType,
        isOnboarded: user.isOnboarded ?? false,
        businessProfile: user.businessProfile || null,
        hasPasskeys: (user.passkeys || []).length > 0,
        hasInstagramToken: Boolean(user.instagramPageAccessToken),
        isInstagramConnected: Boolean(user.instagramPageAccessToken),
      },
    });
  } catch (err) {
    console.error('❌ Passkey login verify error:', err.message);
    res.status(500).json({ error: 'Passkey login failed. Please try again.' });
  }
});

/**
 * POST /api/auth/passkey/register-options (Protected)
 * Starts passkey registration for current user
 */
router.post('/passkey/register-options', requireAuth, async (req, res) => {
  try {
    const options = await authService.generatePasskeyRegistrationOptions(req.user, req);
    res.json(options);
  } catch (err) {
    console.error('❌ Passkey register options error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/passkey/register-verify (Protected)
 * Completes passkey registration for current user
 */
router.post('/passkey/register-verify', requireAuth, async (req, res) => {
  try {
    const { response, name } = req.body || {};
    if (!response || typeof response !== 'object') return res.status(400).json({ error: 'Registration response required' });

    let verified = false;
    try {
      verified = await authService.verifyPasskeyRegistration(req.user, response, req);
    } catch (verifyErr) {
      console.warn('⚠️ Passkey registration verify failed:', verifyErr.message);
      verified = false;
    }
    if (!verified) {
      return res.status(400).json({ error: 'Failed to verify passkey registration' });
    }

    // Set device name from client or detect dynamically from User-Agent
    const userAgent = req.get('user-agent') || '';
    let resolvedName = (typeof name === 'string' ? name : '').trim();
    if (!resolvedName) {
      if (/iPhone/i.test(userAgent)) resolvedName = 'iPhone (Touch ID / Face ID)';
      else if (/iPad/i.test(userAgent)) resolvedName = 'iPad (Touch ID)';
      else if (/Android/i.test(userAgent)) resolvedName = 'Android (Fingerprint)';
      else if (/Macintosh|Mac OS X/i.test(userAgent)) resolvedName = 'Mac (Touch ID)';
      else if (/Windows/i.test(userAgent)) resolvedName = 'Windows PC (Windows Hello)';
      else resolvedName = 'Security Key / Biometrics';
    }

    if (req.user.passkeys.length > 0) {
      req.user.passkeys[req.user.passkeys.length - 1].name = resolvedName;
      await req.user.save();
    }

    res.json({ success: true, message: 'Passkey added successfully!', deviceName: resolvedName });
  } catch (err) {
    console.error('❌ Passkey register verify error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth/totp-setup (Protected)
 * Returns QR code and secret for setting up Zoho OneAuth app
 */
router.get('/totp-setup', requireAuth, async (req, res) => {
  try {
    const totpData = await authService.getTotpQrCode(req.user);
    res.json({
      success: true,
      ...totpData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth/me (Protected)
 * Returns current authenticated profile and security status
 */
router.get('/me', requireAuth, async (req, res) => {
  const user = req.user;
  const isSuper = user.role === 'superadmin';

  res.json({
    id: user._id,
    _id: user._id,
    username: user.username,
    email: user.email,
    profilePicUrl: user.profilePicUrl || '',
    firstName: user.firstName,
    lastName: user.lastName,
    mobileNumber: user.mobileNumber,
    whatsappNumber: user.whatsappNumber,
    instagramUsername: user.instagramUsername,
    instagramId: user.instagramId || '',
    role: isSuper ? 'superadmin' : 'user',
    accountType: user.accountType,
    isOnboarded: user.isOnboarded ?? false,
    businessProfile: user.businessProfile || null,
    hasInstagramToken: Boolean(user.instagramPageAccessToken),
    isInstagramConnected: Boolean(user.instagramPageAccessToken),
    igApprovalStatus: user.igApprovalStatus || (user.instagramPageAccessToken ? 'approved' : 'none'),
    igApprovalRequestedAt: user.igApprovalRequestedAt,
    igApprovedAt: user.igApprovedAt,
    address: user.address,
    twoFactorEnabled: user.twoFactor?.enabled || false,
    passkeys: (user.passkeys || []).map(p => ({
      id: p.credentialId,
      name: p.name,
      createdAt: p.createdAt,
      deviceType: p.deviceType,
    })),
  });
});

/**
 * POST /api/auth/onboarding (Protected)
 * Configures new user account: Business vs Personal, AI Persona Tone, Chat Rules & Automation
 */
router.post('/onboarding', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const {
      accountType, // 'business' | 'personal' | 'creator'
      businessProfile, // { businessName, category, description }
      personaTone, // 'professional' | 'witty' | 'friendly' | 'roast'
      greetingMessage,
      chatMode, // 'everyone' | 'everyone_except' | 'only_selected'
      enableGlobalBot, // boolean
      instagramUsername,
      instagramPageAccessToken,
      instagramAccountId,
    } = req.body || {};

    const stringFields = { accountType, personaTone, greetingMessage, chatMode, instagramUsername, instagramPageAccessToken, instagramAccountId };
    if (Object.values(stringFields).some(v => v !== undefined && v !== null && typeof v !== 'string')) {
      return res.status(400).json({ error: 'Invalid onboarding details.' });
    }
    if (businessProfile !== undefined && businessProfile !== null &&
        (typeof businessProfile !== 'object' ||
         ['businessName', 'category', 'description'].some(k => businessProfile[k] !== undefined && businessProfile[k] !== null && typeof businessProfile[k] !== 'string'))) {
      return res.status(400).json({ error: 'Invalid business profile.' });
    }
    if (accountType && !['personal', 'creator', 'business', 'agency'].includes(accountType)) {
      return res.status(400).json({ error: 'Invalid account type.' });
    }

    if (accountType) {
      user.accountType = accountType;
    }
    if (instagramUsername) {
      user.instagramUsername = instagramUsername.trim().replace(/^@/, '');
    }
    if (instagramPageAccessToken !== undefined && instagramPageAccessToken !== null) {
      user.instagramPageAccessToken = instagramPageAccessToken.trim();
    }
    if (instagramAccountId !== undefined && instagramAccountId !== null) {
      if (instagramAccountId.trim() && await User.accountIdHolder(instagramAccountId, user._id)) {
        return res.status(409).json({ error: 'This Instagram account is already connected to another Chatter account.' });
      }
      user.instagramAccountId = instagramAccountId.trim();
    }
    if (businessProfile) {
      user.businessProfile = {
        businessName: businessProfile.businessName || '',
        category: businessProfile.category || '',
        description: businessProfile.description || '',
      };
    }
    user.isOnboarded = true;
    await user.save();

    // Sync with PersonaConfig
    try {
      const PersonaConfig = require('../models/PersonaConfig');
      let persona = await PersonaConfig.forOwner(user._id);
      if (!persona) {
        persona = new PersonaConfig({ ownerId: user._id });
      }
      if (personaTone) {
        persona.tone = personaTone;
      }
      if (greetingMessage) {
        persona.greeting = greetingMessage;
      }
      if (accountType === 'business') {
        persona.persona = 'helpful_assistant';
      } else if (accountType === 'personal') {
        persona.persona = 'friendly_peer';
      }
      await persona.save();
    } catch (e) {
      console.warn('Could not update persona during onboarding:', e.message);
    }

    res.json({
      success: true,
      message: 'Onboarding configured successfully!',
      user: {
        id: user._id,
        _id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role || 'user',
        accountType: user.accountType,
        isOnboarded: true,
        businessProfile: user.businessProfile,
        profilePicUrl: user.profilePicUrl || '',
        instagramUsername: user.instagramUsername || '',
        instagramId: user.instagramId || '',
        hasInstagramToken: Boolean(user.instagramPageAccessToken),
      }
    });
  } catch (err) {
    console.error('❌ Onboarding error:', err.message);
    res.status(500).json({ error: 'Failed to complete onboarding. Please try again.' });
  }
});

/**
 * POST /api/auth/onboarding/skip (Protected)
 * Allows users to dismiss/skip onboarding and configure later in Settings
 */
router.post('/onboarding/skip', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    user.isOnboarded = true;
    await user.save();
    res.json({
      success: true,
      message: 'Onboarding dismissed. You can configure rules and persona anytime in Settings.',
      user: {
        id: user._id,
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role || 'user',
        accountType: user.accountType,
        isOnboarded: true,
        businessProfile: user.businessProfile,
        profilePicUrl: user.profilePicUrl || '',
      }
    });
  } catch (err) {
    console.error('❌ Skip onboarding error:', err.message);
    res.status(500).json({ error: 'Failed to skip onboarding: ' + err.message });
  }
});

/**
 * GET /api/auth/instagram/connect
 * Redirects to Meta OAuth login dialog for in-app Instagram connection
 */
router.get('/instagram/connect', (req, res) => {
  try {
    const metaAppId = process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID;
    const clientOrigin = resolveAllowedOrigin(req.query.origin);
    // The popup cannot set headers, so the session JWT arrives as ?token= — it is verified here
    // and only the userId goes into the signed state (never the JWT itself).
    const userJwt = typeof req.query.token === 'string' ? req.query.token : '';
    const decodedSession = userJwt ? authService.verifyToken(userJwt) : null;

    if (!metaAppId) {
      return res.status(500).send(renderOAuthResultPage({ ok: false, origin: clientOrigin, message: 'Instagram connection is not configured on the server (META_APP_ID missing).' }));
    }
    if (!decodedSession || !decodedSession.userId) {
      return res.status(401).send(renderOAuthResultPage({ ok: false, origin: clientOrigin, message: 'Your session has expired. Please sign in again and retry.' }));
    }

    let backendUrl = process.env.BACKEND_URL || (req.headers.host ? `https://${req.headers.host}` : 'https://instagram-ai-bot-64tf.onrender.com');
    backendUrl = backendUrl.replace(/\/+$/, '').replace(/^http:\/\/(.*onrender\.com)/i, 'https://$1');
    const redirectUri = `${backendUrl}/api/auth/instagram/callback`;

    const state = authService.signOAuthState({
      userId: String(decodedSession.userId),
      origin: clientOrigin,
      redirectUri,
      nonce: crypto.randomBytes(16).toString('hex'),
    });

    const scopes = [
      'instagram_basic',
      'instagram_manage_messages',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_metadata'
    ].join(',');

    // Direct Meta / Facebook Login for Business Authorization URL
    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;

    res.redirect(authUrl);
  } catch (err) {
    console.error('❌ /instagram/connect error:', err.message);
    res.status(500).send('Failed to initiate Instagram OAuth.');
  }
});

/**
 * Renders the auto-closing popup page for the Instagram OAuth flow.
 * Every interpolated value is HTML-escaped (markup) or JSON-encoded (script).
 * postMessage targets only the validated origin and never carries the access token.
 */
function renderOAuthResultPage({ ok, origin, message, instagramUsername = '', instagramAccountId = '' }) {
  const safeOrigin = resolveAllowedOrigin(origin);
  const messageData = ok
    ? { type: 'INSTAGRAM_OAUTH_SUCCESS', payload: { success: true, instagramUsername: instagramUsername || '', instagramAccountId: instagramAccountId || '' } }
    : { type: 'INSTAGRAM_OAUTH_ERROR', error: String(message || 'Authorization failed') };
  const badge = ok ? 'SUCCESSFULLY CONNECTED' : 'CONNECTION FAILED';
  const heading = ok ? 'Instagram Account Linked!' : 'Could Not Connect';
  const body = ok
    ? `Connected as <strong>@${escapeHtml(instagramUsername || 'Instagram')}</strong>.<br/>Returning to Chatter OS...`
    : `${escapeHtml(message || 'Authorization failed')}`;
  return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${ok ? 'Instagram Connected' : 'Connection Failed'}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fafafa; color: #09090b; }
          .card { background: #ffffff; border: 1px solid ${ok ? '#e4e4e7' : '#fee2e2'}; border-radius: 16px; padding: 36px 30px; max-width: 420px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.06); }
          .badge { display: inline-block; background: ${ok ? '#dcfce7' : '#fee2e2'}; color: ${ok ? '#15803d' : '#b91c1c'}; font-weight: 700; font-size: 12px; padding: 4px 10px; border-radius: 999px; margin-bottom: 12px; }
          h2 { margin: 0 0 8px 0; font-size: 20px; }
          p { color: #71717a; font-size: 14px; line-height: 1.5; margin: 0 0 16px 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">${badge}</div>
          <h2>${heading}</h2>
          <p>${body}</p>
          ${ok ? '' : '<p style="font-size: 12px; color: #9ca3af;">You can also enter your Page Access Token manually in the setup wizard.</p>'}
        </div>
        <script>
          (function () {
            var targetOrigin = ${jsonForScript(safeOrigin)};
            var data = ${jsonForScript(messageData)};
            if (window.opener) {
              window.opener.postMessage(data, targetOrigin);
              setTimeout(function () { window.close(); }, ${ok ? 1200 : 3500});
            } else if (${ok ? 'true' : 'false'}) {
              setTimeout(function () { window.location.href = targetOrigin; }, 1500);
            }
          })();
        </script>
      </body>
      </html>
    `;
}

/**
 * GET /api/auth/instagram/callback
 * Exchanges Meta / Instagram OAuth code for Page Access Token & Instagram Business ID
 */
router.get('/instagram/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Verify the signed, short-lived state (userId + origin + nonce)
    const decodedState = typeof state === 'string' && state ? authService.verifyOAuthState(state) : null;
    if (!decodedState || !decodedState.userId) {
      return res.status(400).send(renderOAuthResultPage({ ok: false, origin: null, message: 'Invalid or expired authorization request. Please start the connection again.' }));
    }
    const origin = resolveAllowedOrigin(decodedState.origin);
    const stateUserId = String(decodedState.userId);
    const savedRedirectUri = typeof decodedState.redirectUri === 'string' ? decodedState.redirectUri : '';

    if (error) {
      console.error('❌ Meta OAuth error:', error, error_description);
      const safeErr = String(error_description || error || 'Authorization was cancelled');
      return res.send(renderOAuthResultPage({ ok: false, origin, message: safeErr }));
    }

    if (!code || typeof code !== 'string') {
      return res.status(400).send(renderOAuthResultPage({ ok: false, origin, message: 'No authorization code provided by Meta.' }));
    }

    // Strip URL fragment #_ from code
    const cleanCode = (code || '').split('#')[0].trim();
    const instagramAppId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID || '';
    const metaAppId = process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID || '';
    const metaAppSecret = process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET || '';
    if (!metaAppId || !metaAppSecret) {
      console.error('❌ Meta OAuth callback: META_APP_ID / META_APP_SECRET (or INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET) not configured.');
      return res.status(500).send(renderOAuthResultPage({ ok: false, origin, message: 'Instagram connection is not configured on the server. Please contact support.' }));
    }

    let backendUrl = process.env.BACKEND_URL || (req.headers.host ? `https://${req.headers.host}` : 'https://instagram-ai-bot-64tf.onrender.com');
    backendUrl = backendUrl.replace(/\/+$/, '').replace(/^http:\/\/(.*onrender\.com)/i, 'https://$1');
    const defaultUri = `${backendUrl}/api/auth/instagram/callback`;

    // Candidate redirect URIs: exactly match saved state or try normalized variations
    const baseUri = (savedRedirectUri || defaultUri).trim();
    const normalizedNoSlash = baseUri.replace(/\/+$/, '');
    const redirectUriCandidates = Array.from(new Set([
      baseUri,
      normalizedNoSlash,
      `${normalizedNoSlash}/`,
      normalizedNoSlash.replace(/^https:/i, 'http:'),
      `${normalizedNoSlash.replace(/^https:/i, 'http:')}/`,
    ]));

    // Candidate App IDs (from environment only)
    const appIdCandidates = Array.from(new Set([
      metaAppId,
      instagramAppId,
    ])).filter(Boolean);

    let shortLivedToken = '';
    let instagramAccountId = '';
    let instagramUsername = '';
    let lastExchangeError = '';

    // Step 1: Facebook Graph API token exchange (Primary for Facebook Login for Business)
    for (const testAppId of appIdCandidates) {
      if (shortLivedToken) break;
      for (const uri of redirectUriCandidates) {
        if (shortLivedToken) break;
        try {
          const fbRes = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
            params: {
              client_id: testAppId,
              client_secret: metaAppSecret,
              redirect_uri: uri,
              code: cleanCode
            }
          });
          if (fbRes.data?.access_token) {
            shortLivedToken = fbRes.data.access_token;
            console.log(`✅ [Facebook Graph API] Token exchange succeeded with App ID ${testAppId} and URI ${uri}`);
            break;
          }
        } catch (fbErr) {
          lastExchangeError = fbErr.response?.data?.error?.message || fbErr.message;
          console.warn(`⚠️ [Facebook Graph API] Attempt failed (AppId=${testAppId}, URI=${uri}):`, fbErr.response?.data?.error || fbErr.message);
        }
      }
    }

    // Step 1 Fallback: Direct Instagram API token exchange (https://api.instagram.com/oauth/access_token)
    if (!shortLivedToken) {
      for (const testAppId of appIdCandidates) {
        if (shortLivedToken) break;
        for (const uri of redirectUriCandidates) {
          if (shortLivedToken) break;
          try {
            const igFormData = new URLSearchParams();
            igFormData.append('client_id', testAppId);
            igFormData.append('client_secret', metaAppSecret);
            igFormData.append('grant_type', 'authorization_code');
            igFormData.append('redirect_uri', uri);
            igFormData.append('code', cleanCode);

            const igRes = await axios.post('https://api.instagram.com/oauth/access_token', igFormData.toString(), {
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            if (igRes.data?.access_token) {
              shortLivedToken = igRes.data.access_token;
              instagramAccountId = igRes.data.user_id ? String(igRes.data.user_id) : '';
              console.log(`✅ [Instagram API] Token exchange succeeded with App ID ${testAppId} and URI ${uri}`);
              break;
            }
          } catch (igErr) {
            lastExchangeError = igErr.response?.data?.error_message || igErr.response?.data?.error?.message || igErr.message;
            console.warn(`⚠️ [Instagram API] Attempt failed (AppId=${testAppId}, URI=${uri}):`, igErr.response?.data || igErr.message);
          }
        }
      }
    }

    if (!shortLivedToken) {
      console.error('❌ All token exchange attempts failed:', lastExchangeError);
      throw new Error('Token exchange failed: ' + (lastExchangeError || 'Error validating verification code.'));
    }

    // Step 2: Exchange for 60-day long-lived token
    let longLivedToken = shortLivedToken;
    try {
      const longLivedRes = await axios.get('https://graph.instagram.com/access_token', {
        params: {
          grant_type: 'ig_exchange_token',
          client_secret: metaAppSecret,
          access_token: shortLivedToken
        }
      });
      if (longLivedRes.data?.access_token) {
        longLivedToken = longLivedRes.data.access_token;
      }
    } catch (llErr) {
      try {
        const fbLongLived = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: metaAppId,
            client_secret: metaAppSecret,
            fb_exchange_token: shortLivedToken
          }
        });
        if (fbLongLived.data?.access_token) {
          longLivedToken = fbLongLived.data.access_token;
        }
      } catch (e) {
        console.warn('Long-lived token exchange warning:', e.message);
      }
    }

    // Step 3: Fetch profile identity (username and ID)
    try {
      const profileRes = await axios.get('https://graph.instagram.com/v21.0/me', {
        params: {
          fields: 'id,username,name,account_type',
          access_token: longLivedToken
        }
      });
      if (profileRes.data?.username) {
        instagramUsername = profileRes.data.username;
        instagramAccountId = profileRes.data.id || instagramAccountId;
      }
    } catch (profileErr) {
      // Fallback via Facebook Pages
      try {
        const accountsRes = await axios.get('https://graph.facebook.com/v21.0/me/accounts', {
          params: {
            fields: 'id,name,access_token,instagram_business_account{id,username,name}',
            access_token: longLivedToken
          }
        });
        const pages = accountsRes.data?.data || [];
        for (const page of pages) {
          if (page.instagram_business_account) {
            longLivedToken = page.access_token || longLivedToken;
            instagramAccountId = page.instagram_business_account.id;
            instagramUsername = page.instagram_business_account.username;
            console.log(`✅ [Meta OAuth] Linked via Instagram Business Account: @${instagramUsername} (${instagramAccountId})`);
            break;
          }
        }
        if (!instagramAccountId && pages.length > 0) {
          const firstPage = pages[0];
          longLivedToken = firstPage.access_token || longLivedToken;
          instagramAccountId = firstPage.id;
          instagramUsername = firstPage.name;
          console.log(`ℹ️ [Meta OAuth] Linked via Facebook Page: ${firstPage.name} (${firstPage.id})`);
        }
      } catch (e) {
        console.warn('⚠️ [Meta OAuth] Pages lookup error:', e.message);
      }
    }

    if (!instagramUsername) {
      try {
        const meRes = await axios.get('https://graph.facebook.com/v21.0/me', {
          params: { fields: 'id,name', access_token: longLivedToken }
        });
        if (meRes.data?.name) {
          instagramUsername = meRes.data.name;
          if (!instagramAccountId) instagramAccountId = meRes.data.id;
        }
      } catch (e) {}
    }

    // 4. Save to the User document identified by the signed state
    const linkedPageToken = longLivedToken;
    if (stateUserId && mongoose.isValidObjectId(stateUserId)) {
      try {
        {
          const user = await User.findById(stateUserId);
          if (user) {
            // Meta just proved this person owns the account: release it from anyone who claimed it before
            if (instagramAccountId) {
              const PersonaConfigModel = require('../models/PersonaConfig');
              await User.updateMany({ _id: { $ne: user._id }, instagramAccountId }, { $set: { instagramAccountId: '', instagramPageAccessToken: '', hasInstagramToken: false, isInstagramConnected: false } });
              await PersonaConfigModel.updateMany({ ownerId: { $ne: user._id }, instagramAccountId }, { $set: { instagramAccountId: '', instagramPageAccessToken: '' } });
            }
            if (linkedPageToken) user.instagramPageAccessToken = linkedPageToken;
            if (instagramAccountId) user.instagramAccountId = instagramAccountId;
            if (instagramUsername) user.instagramUsername = instagramUsername;
            user.hasInstagramToken = Boolean(linkedPageToken);
            user.isInstagramConnected = Boolean(linkedPageToken);
            await user.save();

            // Sync PersonaConfig as well
            try {
              const PersonaConfig = require('../models/PersonaConfig');
              await PersonaConfig.findOneAndUpdate(
                { ownerId: user._id },
                {
                  $set: {
                    ownerId: user._id,
                    instagramPageAccessToken: linkedPageToken,
                    instagramAccountId: instagramAccountId,
                    ...(instagramUsername ? { instagramHandle: `@${instagramUsername.replace(/^@/, '')}` } : {}),
                    globalBotActive: true
                  }
                },
                { upsert: true, new: true }
              );
            } catch (personaErr) {
              console.warn('Could not sync PersonaConfig in OAuth callback:', personaErr.message);
            }
          }
        }
      } catch (e) {
        console.warn('Could not auto-save token from OAuth state:', e.message);
      }
    }

    // 5. Return auto-closing HTML that posts message to opener (token stays server-side)
    return res.send(renderOAuthResultPage({ ok: true, origin, instagramUsername, instagramAccountId }));
  } catch (err) {
    console.error('❌ Meta OAuth callback error:', err.response?.data || err.message);
    const errText = String(err.response?.data?.error?.message || err.message || 'Unknown error');
    let errOrigin = null;
    try {
      const st = typeof req.query.state === 'string' ? authService.verifyOAuthState(req.query.state) : null;
      errOrigin = st ? st.origin : null;
    } catch (e) {}
    return res.send(renderOAuthResultPage({ ok: false, origin: errOrigin, message: errText }));
  }
});

/**
 * PUT /api/auth/profile (Protected)
 * Updates user profile details including profile picture
 */
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { username, firstName, lastName, mobileNumber, whatsappNumber, instagramUsername, address, profilePicUrl } = req.body || {};

    const stringFields = { username, firstName, lastName, mobileNumber, whatsappNumber, instagramUsername, profilePicUrl };
    if (Object.values(stringFields).some(v => v !== undefined && v !== null && typeof v !== 'string')) {
      return res.status(400).json({ error: 'Invalid profile details.' });
    }
    const addressKeys = ['street', 'city', 'state', 'country', 'postalCode'];
    if (address !== undefined && address !== null &&
        (typeof address !== 'object' || addressKeys.some(k => address[k] !== undefined && address[k] !== null && typeof address[k] !== 'string'))) {
      return res.status(400).json({ error: 'Invalid address.' });
    }

    // Username change: sanitize like registration and enforce uniqueness
    if (typeof username === 'string' && username.trim()) {
      const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
      if (cleanUsername.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters.' });
      }
      if (cleanUsername !== user.username) {
        const taken = await User.findOne({ username: cleanUsername, _id: { $ne: user._id } });
        if (taken) {
          return res.status(409).json({ error: 'This username is already taken. Please choose another.' });
        }
        user.username = cleanUsername;
      }
    }

    // Instagram handle change: must not belong to another verified user
    if (typeof instagramUsername === 'string') {
      const cleanIg = instagramUsername.trim().replace(/^@/, '');
      if (cleanIg && cleanIg.toLowerCase() !== (user.instagramUsername || '').toLowerCase()) {
        const escapeRegex = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const igTaken = await User.findOne({
          instagramUsername: new RegExp(`^@?${escapeRegex(cleanIg)}$`, 'i'),
          isVerified: { $ne: false },
          _id: { $ne: user._id },
        });
        if (igTaken) {
          return res.status(409).json({ error: `The Instagram handle @${cleanIg} is already registered to another Chatter OS account.` });
        }
      }
      user.instagramUsername = cleanIg;
    }

    if (typeof profilePicUrl === 'string') user.profilePicUrl = profilePicUrl;
    if (typeof firstName === 'string') user.firstName = firstName.trim();
    if (typeof lastName === 'string') user.lastName = lastName.trim();
    if (typeof mobileNumber === 'string') user.mobileNumber = mobileNumber.trim();
    if (typeof whatsappNumber === 'string') user.whatsappNumber = whatsappNumber.trim();
    if (address && typeof address === 'object') {
      user.address = {
        street: address.street || user.address?.street || '',
        city: address.city || user.address?.city || '',
        state: address.state || user.address?.state || '',
        country: address.country || user.address?.country || '',
        postalCode: address.postalCode || user.address?.postalCode || '',
      };
    }

    await user.save();
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        _id: user._id,
        username: user.username,
        email: user.email,
        profilePicUrl: user.profilePicUrl || '',
        firstName: user.firstName,
        lastName: user.lastName,
        mobileNumber: user.mobileNumber,
        whatsappNumber: user.whatsappNumber,
        instagramUsername: user.instagramUsername,
        accountType: user.accountType,
        address: user.address,
        hasPasskeys: (user.passkeys || []).length > 0,
      }
    });
  } catch (err) {
    console.error('❌ Profile update error:', err.message);
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'This username is already taken. Please choose another.' });
    }
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

/**
 * PUT /api/auth/passkeys/:credentialId (Protected)
 * Renames a registered passkey
 */
router.put('/passkeys/:credentialId', requireAuth, async (req, res) => {
  try {
    const { credentialId } = req.params;
    const { name } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Passkey name is required' });
    }
    const passkey = (req.user.passkeys || []).find(p => p.credentialId === credentialId);
    if (!passkey) {
      return res.status(404).json({ error: 'Passkey not found' });
    }
    passkey.name = name.trim();
    await req.user.save();
    res.json({ success: true, message: 'Passkey renamed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/auth/passkeys/:credentialId (Protected)
 * Removes a registered passkey
 */
router.delete('/passkeys/:credentialId', requireAuth, async (req, res) => {
  try {
    const { credentialId } = req.params;
    req.user.passkeys = (req.user.passkeys || []).filter(p => p.credentialId !== credentialId);
    await req.user.save();
    res.json({ success: true, message: 'Passkey deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth/instagram/check-handle
 * Public endpoint to live check if an Instagram handle exists, fetching profile picture, display name, and permanent IG ID
 */
router.get('/instagram/check-handle', async (req, res) => {
  try {
    const rawHandle = (req.query.handle || '').toString().trim();
    const handle = rawHandle.replace(/^@/, '').toLowerCase();
    if (!handle || handle.length < 2) {
      return res.status(400).json({ error: 'Please enter a valid Instagram handle.' });
    }

    // 1. Check if handle is already registered by an existing verified user in Chatter OS
    const escapeRegex = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const safeRegex = new RegExp(`^${escapeRegex(handle)}$`, 'i');
    const safeHandleRegex = new RegExp(`^@?${escapeRegex(handle)}$`, 'i');

    const existingUser = await User.findOne({
      instagramUsername: safeRegex,
      isVerified: { $ne: false }
    });
    if (existingUser) {
      return res.json({
        exists: true,
        alreadyRegistered: true,
        handle,
        message: `@${handle} is already registered on Chatter OS by an existing account.`
      });
    }

    // 2. Query People Directory (UserMemory, SocialGraph, PersonaConfig)
    const UserMemory = require('../models/UserMemory');
    const SocialGraph = require('../models/SocialGraph');
    const PersonaConfig = require('../models/PersonaConfig');

    const [matchedMemory, matchedContact, persona] = await Promise.all([
      UserMemory.findOne({ username: safeRegex }),
      SocialGraph.findOne({
        $or: [
          { instagramHandle: safeHandleRegex },
          { name: safeRegex }
        ]
      }),
      PersonaConfig.findOne({ instagramUsername: safeHandleRegex })
    ]);

    let dbProfile = null;
    if (matchedMemory || matchedContact || persona) {
      dbProfile = {
        fullName: matchedContact?.name || matchedMemory?.name || persona?.name || handle,
        profilePicUrl: matchedContact?.profilePic || matchedMemory?.profilePic || persona?.profilePicUrl || '',
        instagramId: matchedContact?.senderId || matchedMemory?.senderId || persona?.instagramId || '',
        isProfessional: true,
      };
    }

    // 3. Fetch profile from account name using Instagram live scraper logic
    const axios = require('axios');
    let liveProfile = null;

    try {
      const targetUrl = `https://www.instagram.com/${encodeURIComponent(handle)}/`;
      const response = await axios.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 9000,
        validateStatus: () => true
      });

      const html = response.data || '';
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1] || '';
      const desc = html.match(/meta content=\"([^\"]+)\" name=\"description\"/)?.[1] ||
                   html.match(/meta property=\"og:description\" content=\"([^\"]+)\"/)?.[1] || '';
      let ogImg = html.match(/meta property=\"og:image\" content=\"([^\"]+)\"/)?.[1] || '';
      if (ogImg) {
        ogImg = ogImg.replace(/&amp;/g, '&');
      }

      const isNotFound = title.startsWith('Page Not Found') || title === 'Instagram' || response.status === 404;
      const hasRichMeta = !isNotFound && (Boolean(desc) || Boolean(ogImg));

      if (hasRichMeta) {
        const decodeHtmlEntities = (str) => {
          if (!str) return '';
          return str
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
              try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return ''; }
            })
            .replace(/&#([0-9]+);/g, (_, dec) => {
              try { return String.fromCodePoint(parseInt(dec, 10)); } catch { return ''; }
            })
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&apos;/g, "'");
        };

        let fullName = handle;
        if (title.includes('(&#064;')) {
          fullName = decodeHtmlEntities(title.split('(&#064;')[0].trim());
        } else if (title.includes('(@')) {
          fullName = decodeHtmlEntities(title.split('(@')[0].trim());
        }

        const idMatch = html.match(/\"props\":\{\"id\":\"([0-9]+)\"/i) ||
                        html.match(/\"id\":\"([0-9]{5,25})\"/i) ||
                        html.match(/profilePage_([0-9]+)/i) ||
                        html.match(/\/([0-9]+)_[0-9]+_[0-9]+_n\.jpg/);
        const instagramId = idMatch ? idMatch[1] : '';

        liveProfile = {
          fullName: fullName || handle,
          profilePicUrl: ogImg || '',
          instagramId,
          bio: desc,
          verified: html.includes('"is_verified":true') || html.includes('Verified')
        };
      }
    } catch (scrapeErr) {
      console.warn(`Instagram live check note for @${handle}:`, scrapeErr.message);
    }

    // 4. Combine DB and live scraped profile
    if (dbProfile || liveProfile) {
      const finalFullName = (dbProfile?.fullName && dbProfile.fullName !== handle)
        ? dbProfile.fullName
        : (liveProfile?.fullName || handle);
      const finalPic = liveProfile?.profilePicUrl || dbProfile?.profilePicUrl || '';
      const finalId = dbProfile?.instagramId || liveProfile?.instagramId || '';

      // Persist discovered profile picture back to UserMemory if missing
      if (matchedMemory && !matchedMemory.profilePic && finalPic) {
        matchedMemory.profilePic = finalPic;
        matchedMemory.save().catch(() => {});
      }

      return res.json({
        exists: true,
        handle,
        fullName: finalFullName,
        profilePicUrl: finalPic,
        instagramId: finalId,
        bio: liveProfile?.bio || '',
        verified: Boolean(liveProfile?.verified),
        isProfessional: true,
        fromPeopleDirectory: Boolean(dbProfile)
      });
    }

    // 5. If live scraper was rate-limited or blocked by Instagram from cloud IP,
    // do not block valid handles! Allow valid handle formats so users are never falsely locked out.
    if (/^[a-zA-Z0-9._]{1,30}$/.test(handle)) {
      return res.json({
        exists: true,
        handle,
        fullName: handle,
        profilePicUrl: '',
        instagramId: '',
        bio: '',
        verified: false,
        isProfessional: true,
        fromPeopleDirectory: false
      });
    }

    // 6. Only fail if handle syntax is invalid
    return res.json({
      exists: false,
      handle,
      message: 'Invalid Instagram handle format. Must be 1-30 characters containing only letters, numbers, periods, and underscores.'
    });
  } catch (err) {
    console.error('❌ Check handle error:', err.message);
    res.status(500).json({ error: 'Failed to verify Instagram handle: ' + err.message });
  }
});

/**
 * GET /api/auth/admin/accounts
 * Protected Superadmin endpoint: returns all registered accounts and their connected SocialGraph members
 */
router.get('/admin/accounts', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const isSuper = user.role === 'superadmin';
    if (!isSuper) {
      return res.status(403).json({ error: 'Access denied: Superadmin privileges required.' });
    }

    const SocialGraph = require('../models/SocialGraph');
    const allUsers = await User.find({}).select('-passwordHash -twoFactor.secret -twoFactor.backupCodes -currentChallenge').sort({ createdAt: -1 });
    const allContacts = await SocialGraph.find({}).sort({ createdAt: -1 });

    const accounts = allUsers.map(u => {
      const hasToken = Boolean(u.instagramPageAccessToken);
      return {
        id: u._id,
        username: u.username,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role || 'user',
        accountType: u.accountType || 'personal',
        isOnboarded: u.isOnboarded ?? false,
        businessProfile: u.businessProfile || null,
        mobileNumber: u.mobileNumber || '',
        whatsappNumber: u.whatsappNumber || '',
        instagramUsername: u.instagramUsername || '',
        instagramId: u.instagramId || u.instagramAccountId || '',
        hasInstagramToken: hasToken,
        isInstagramConnected: hasToken,
        igApprovalStatus: u.igApprovalStatus || (hasToken ? 'approved' : 'none'),
        igApprovalRequestedAt: u.igApprovalRequestedAt || null,
        igApprovedAt: u.igApprovedAt || null,
        profilePicUrl: u.profilePicUrl || '',
        isVerified: u.isVerified,
        hasPasskeys: (u.passkeys || []).length > 0,
        passkeyCount: (u.passkeys || []).length,
        lastLogin: u.lastLogin,
        createdAt: u.createdAt,
      };
    });

    res.json({
      success: true,
      superadmin: user.email,
      totalAccounts: accounts.length,
      totalContacts: allContacts.length,
      accounts,
      contactsBreakdown: {
        total: allContacts.length,
        closeFriends: allContacts.filter(c => c.category === 'close_friend').length,
        onlineFriends: allContacts.filter(c => c.category === 'online_friend').length,
        unlinked: allContacts.filter(c => !c.instagramHandle && !c.senderId).length,
      },
      contacts: allContacts.map(c => ({
        id: c._id,
        name: c.name,
        handle: c.instagramHandle || '',
        profilePic: c.profilePic || '',
        senderId: c.senderId || '',
        category: c.category || 'online_friend',
        relationship: c.relationshipToSam || 'friend',
        factsCount: (c.lore || []).length,
        connectionsCount: (c.connections || []).length,
      })),
    });
  } catch (err) {
    console.error('❌ Superadmin accounts error:', err.message);
    res.status(500).json({ error: 'Failed to fetch admin accounts: ' + err.message });
  }
});

/**
 * POST /api/auth/ig-request-access
 * User requests permission to connect Instagram in Meta Test Mode
 */
router.get('/ig-request-access', requireAuth, async (req, res) => {
  return res.json({
    igApprovalStatus: req.user.igApprovalStatus || (req.user.instagramPageAccessToken ? 'approved' : 'none'),
    instagramUsername: req.user.instagramUsername || '',
  });
});

router.post('/ig-request-access', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { instagramUsername } = req.body || {};

    if (instagramUsername !== undefined && instagramUsername !== null && typeof instagramUsername !== 'string') {
      return res.status(400).json({ error: 'Invalid Instagram username.' });
    }
    if (instagramUsername) {
      const cleanIg = instagramUsername.trim().replace(/^@/, '');
      if (cleanIg && cleanIg.toLowerCase() !== (user.instagramUsername || '').toLowerCase()) {
        const escapeRegex = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const igTaken = await User.findOne({
          instagramUsername: new RegExp(`^@?${escapeRegex(cleanIg)}$`, 'i'),
          isVerified: { $ne: false },
          _id: { $ne: user._id },
        });
        if (igTaken) {
          return res.status(409).json({ error: `The Instagram handle @${cleanIg} is already registered to another Chatter OS account.` });
        }
      }
      user.instagramUsername = cleanIg;
    }

    user.igApprovalStatus = 'pending';
    user.igApprovalRequestedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Request submitted! Please wait for admin approval in Meta App Roles.',
      igApprovalStatus: 'pending',
      instagramUsername: user.instagramUsername,
    });
  } catch (err) {
    console.error('❌ Request IG Access error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/admin/approve-ig-access
 * Superadmin marks user as approved after adding their handle to Meta Roles and dispatches email
 */
router.post('/admin/approve-ig-access', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied: Superadmin privileges required.' });
    }

    const { userId, instagramUsername } = req.body || {};
    if (!userId) {
      return res.status(400).json({ error: 'Target userId is required.' });
    }
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: 'Invalid userId.' });
    }
    if (instagramUsername !== undefined && instagramUsername !== null && typeof instagramUsername !== 'string') {
      return res.status(400).json({ error: 'Invalid Instagram username.' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (instagramUsername) {
      targetUser.instagramUsername = instagramUsername.trim().replace(/^@/, '');
    }

    targetUser.igApprovalStatus = 'approved';
    targetUser.igApprovedAt = new Date();
    await targetUser.save();

    // Dispatch approval email
    const frontendUrl = process.env.FRONTEND_URL || 'https://instagram-ebon-zeta.vercel.app/settings';
    let emailResult = null;
    try {
      emailResult = await authService.sendApprovalEmail(
        targetUser.email,
        targetUser.firstName || targetUser.username,
        targetUser.instagramUsername,
        frontendUrl
      );
    } catch (e) {
      console.warn('⚠️ Could not send approval email:', e.message);
    }

    res.json({
      success: true,
      message: `Approved @${targetUser.instagramUsername || targetUser.username}! ${emailResult?.success ? 'Notification email sent.' : 'Saved in database.'}`,
      user: {
        id: targetUser._id,
        _id: targetUser._id,
        igApprovalStatus: 'approved',
        instagramUsername: targetUser.instagramUsername,
      }
    });
  } catch (err) {
    console.error('❌ Admin approve IG access error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/admin/impersonate
 * Superadmin can switch directly into any user's workspace with 1 click
 */
router.post('/admin/impersonate', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied: Superadmin privileges required.' });
    }
    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ error: 'Target userId is required.' });
    }
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: 'Invalid userId.' });
    }
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const token = authService.generateToken(targetUser);
    res.json({
      success: true,
      token,
      user: {
        id: targetUser._id,
        _id: targetUser._id,
        email: targetUser.email,
        username: targetUser.username,
        role: targetUser.role || 'user',
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
        profilePicUrl: targetUser.profilePicUrl || '',
        instagramUsername: targetUser.instagramUsername || '',
        instagramId: targetUser.instagramId || '',
        accountType: targetUser.accountType || 'personal',
        isOnboarded: targetUser.isOnboarded ?? false,
        businessProfile: targetUser.businessProfile || null,
        hasPasskeys: (targetUser.passkeys || []).length > 0,
      }
    });
  } catch (err) {
    console.error('Impersonation error:', err);
    res.status(500).json({ error: 'Failed to switch workspace: ' + err.message });
  }
});

/**
 * DELETE /api/admin/accounts/:userId
 * Superadmin can permanently delete any user workspace / account
 */
router.delete('/admin/accounts/:userId', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied: Superadmin privileges required.' });
    }
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: 'Target userId is required.' });
    }
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: 'Invalid userId.' });
    }

    if (req.user._id.toString() === userId.toString()) {
      return res.status(400).json({ error: 'Cannot delete your own superadmin account.' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    const targetHandle = targetUser.instagramUsername || targetUser.username;
    const targetEmail = targetUser.email;

    // Delete user from DB
    await User.findByIdAndDelete(userId);

    // Delete tenant data owned by this user — strictly by ownerId (never by handle/senderId,
    // which default to '' and would wipe other tenants' data)
    const ownerFilter = { ownerId: new mongoose.Types.ObjectId(userId) };
    for (const modelName of ['SocialGraph', 'PersonaConfig', 'MediaVault', 'Message', 'UserMemory']) {
      try {
        const Model = require(`../models/${modelName}`);
        // Safety: never run deleteMany if the model has no ownerId path (filter could be stripped)
        if (!Model.schema.path('ownerId')) continue;
        await Model.deleteMany(ownerFilter);
      } catch (e) {
        console.warn(`${modelName} cleanup warning:`, e.message);
      }
    }

    res.json({
      success: true,
      message: `Account @${targetHandle} (${targetEmail}) was permanently deleted.`
    });
  } catch (err) {
    console.error('Superadmin delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account: ' + err.message });
  }
});

module.exports = {
  router,
  requireAuth,
};
