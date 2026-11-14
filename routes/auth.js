const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const authService = require('../services/authService');
const redisService = require('../services/redisService');
const { setUserInstagram, getUserInstagramToken, clearUserInstagram } = require('../services/instagramTokenService');
const { rateLimit, AccountLockout, SlidingWindowLimiter, track, clientIp, MINUTE } = require('../services/rateLimiter');
const { escapeHtml, safeJsonForScript, asString, resolveUploadPath, PasskeyError } = authService;
const bcrypt = require('bcryptjs');
// Real bcrypt hash (same cost as User.hashPassword) so an unknown account takes as long as a wrong password
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

// ---- Brute-force protection (in memory, per server process) ----
const loginIpLimit = rateLimit({ name: 'login', windowMs: 15 * MINUTE, max: 30 });
const codeIpLimit = rateLimit({ name: 'code', windowMs: 15 * MINUTE, max: 20 });
const sendIpLimit = rateLimit({ name: 'send', windowMs: 15 * MINUTE, max: 10, message: 'Too many code requests. Please wait a few minutes and try again.' });
const registerIpLimit = rateLimit({ name: 'register', windowMs: 60 * MINUTE, max: 10, message: 'Too many sign-up attempts. Please try again later.' });
const passkeyIpLimit = rateLimit({ name: 'passkey', windowMs: 15 * MINUTE, max: 40 });
const handleIpLimit = rateLimit({ name: 'handle', windowMs: MINUTE, max: 20, message: 'Too many handle checks. Please slow down.' });
const oauthIpLimit = rateLimit({ name: 'oauth', windowMs: 15 * MINUTE, max: 30 });
// Per account + network address: 5 wrong codes (OneAuth or emailed) or 10 wrong passwords in 15 min
// lock that address out of that account for 15 min, so a stranger cannot lock the real owner out.
// Per account (any address): 10 wrong codes or 50 wrong passwords still lock it, and each repeat lock
// doubles (15 min, 30, 60 ... up to 24 h), so a 6-digit code cannot be guessed by spreading attempts.
const knownNetworks = new Map(); // shared, so signing in by password at home also shields the code lock
const codeLockout = track(new AccountLockout({ perIp: 5, perAccount: 10, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE, known: knownNetworks }));
const passwordLockout = track(new AccountLockout({ perIp: 10, perAccount: 50, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE, known: knownNetworks }));
// Per email address: at most 3 emailed codes per 15 min
const emailSendLimiter = track(new SlidingWindowLimiter({ windowMs: 15 * MINUTE, max: 3 }));

function lockedResponse(res, status) {
  const seconds = Math.max(1, Math.ceil((status?.retryAfterMs || 0) / 1000));
  res.set('Retry-After', String(seconds));
  return res.status(429).json({
    error: `Too many failed attempts. Please try again in ${Math.ceil(seconds / 60)} minute(s).`,
    retryAfterSeconds: seconds,
  });
}

// Logs the real error, sends the client a generic one
function serverError(res, label, err, message = 'Something went wrong. Please try again.') {
  console.error(`❌ ${label}:`, err?.message || err);
  return res.status(500).json({ error: message });
}

const emailSendAllowed = (email) => emailSendLimiter.hit(String(email).toLowerCase()).allowed;
const tooManyEmails = (res) => res.status(429).json({ error: 'Too many codes were requested for this email. Please wait 15 minutes and try again.' });

// "samjoshua@gmail.com" -> "s*******@gmail.com" so a username lookup does not reveal the full email
function maskEmail(email) {
  const [name, domain] = String(email || '').split('@');
  if (!domain) return '***';
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(1, name.length - 1))}@${domain}`;
}

// Fields every sign-in response returns
function sessionUser(user) {
  return {
    id: user._id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    mobileNumber: user.mobileNumber,
    whatsappNumber: user.whatsappNumber,
    instagramUsername: user.instagramUsername,
    instagramId: user.instagramId || '',
    // The linked account id (not secret; the token itself never leaves the server)
    instagramAccountId: user.instagramAccountId || user.instagram?.accountId || '',
    role: user.role === 'superadmin' ? 'superadmin' : 'user',
    accountType: user.accountType,
    isOnboarded: user.isOnboarded ?? false,
    businessProfile: user.businessProfile || null,
    profilePicUrl: user.profilePicUrl || '',
    hasPasskeys: (user.passkeys || []).length > 0,
    hasInstagramToken: hasIgToken(user),
    isInstagramConnected: hasIgToken(user),
  };
}

// Same rule for every sign-in method
function signInBlocked(res, user) {
  if (user.isVerified === false) {
    return res.status(403).json({ error: 'Please verify your email first. Create the account again to get a new code.', needsVerification: true, email: user.email });
  }
  if (user.isBanned) {
    return res.status(403).json({ error: 'This account has been suspended. Please contact support.' });
  }
  return null;
}

const OAUTH_STATE_TTL_SECONDS = 600;
const OAUTH_NONCE_COOKIE = 'ig_oauth_nonce';
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

// Reads one cookie from the raw header (the app has no cookie-parser)
function readCookie(req, name) {
  const header = String(req.headers?.cookie || '');
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      try { return decodeURIComponent(part.slice(idx + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

// Constant-time compare of the cookie nonce against the hash saved with the OAuth state
function nonceMatches(cookieNonce, savedHash) {
  if (!cookieNonce || typeof savedHash !== 'string' || savedHash.length !== 64) return false;
  const a = Buffer.from(sha256(cookieNonce), 'hex');
  const b = Buffer.from(savedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Small result page for the OAuth popup: every reflected value is escaped
function oauthErrorPage({ title, heading, message, origin, code }) {
  return `
      <!DOCTYPE html>
      <html>
      <head><title>${escapeHtml(title)}</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fafafa; color: #09090b;">
        <div style="background: #ffffff; border: 1px solid #fee2e2; border-radius: 16px; padding: 36px 30px; max-width: 440px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.06);">
          <div style="display: inline-block; background: #fee2e2; color: #b91c1c; font-weight: 700; font-size: 12px; padding: 4px 10px; border-radius: 999px; margin-bottom: 12px;">${escapeHtml(title.toUpperCase())}</div>
          <h2 style="margin: 0 0 8px 0; font-size: 18px; color: #dc2626;">${escapeHtml(heading)}</h2>
          <p style="color: #4b5563; font-size: 13px; line-height: 1.5; margin: 0 0 16px 0;">${escapeHtml(message)}</p>
          <p style="font-size: 12px; color: #9ca3af;">Closing window and returning to Chatter OS...</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage(${jsValue({ type: 'INSTAGRAM_OAUTH_ERROR', error: message, ...(code ? { code } : {}) })}, ${jsValue(origin)});
            setTimeout(() => { window.close(); }, 3500);
          }
        </script>
      </body>
      </html>
    `;
}

// A malformed account id in the URL is a 400, not a database cast error (500)
router.param('userId', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid account id.' });
  next();
});

// Serializes a value so it is safe to embed inside an inline <script> (<, >, &, U+2028/9 escaped)
const jsValue = (v) => safeJsonForScript(v);

// The OAuth popup posts the Instagram token back to this origin, so only our own sites may be used
const DEFAULT_CLIENT_ORIGIN = 'https://instagram-ebon-zeta.vercel.app';
function safeClientOrigin(raw) {
  const allowed = [DEFAULT_CLIENT_ORIGIN, process.env.FRONTEND_URL]
    .filter(Boolean)
    .map((u) => { try { return new URL(u).origin; } catch { return null; } });
  try {
    const { origin, hostname, protocol } = new URL(String(raw || ''));
    if (allowed.includes(origin)) return origin;
    const isLocal = ['localhost', '127.0.0.1'].includes(hostname);
    if (isLocal && (protocol === 'http:' || protocol === 'https:')) return origin;
  } catch { /* fall through */ }
  return DEFAULT_CLIENT_ORIGIN;
}

// With ENCRYPTION_KEY set the plain token field is blank and the token lives encrypted
const hasIgToken = (u) => Boolean(u?.instagramPageAccessToken || u?.instagram?.accessTokenEncrypted);

const newOtpCode = () => crypto.randomInt(100000, 1000000).toString();
const MAX_OTP_ATTEMPTS = 5;

// Checks an emailed 6-digit code stored on user[field]; wipes it after too many wrong tries.
// Returns an error message, or null when the code matches.
async function checkOtp(user, field, code, purpose = '', req = null) {
  const ip = req ? clientIp(req) : '';
  const otp = user[field];
  if (!otp?.code) return 'No pending code. Please request a new one.';
  // A code only works for the flow it was sent for (password reset and OneAuth setup share resetOtp)
  if (purpose && (otp.purpose || '') !== purpose) return 'Invalid 6-digit verification code.';
  if (new Date() > new Date(otp.expiresAt)) return 'Verification code expired. Please request a new one.';
  if (typeof code !== 'string' && typeof code !== 'number') return 'Invalid 6-digit verification code.';
  if (otp.code !== String(code).trim()) {
    codeLockout.recordFailure(`code:${user._id}`, ip);
    // Local copy: after the reset below, otp (a live view of the document) reads back 0
    const attempts = (otp.attempts || 0) + 1;
    user[field] = attempts >= MAX_OTP_ATTEMPTS
      ? { code: '', expiresAt: null, attempts: 0 }
      : { code: otp.code, expiresAt: otp.expiresAt, attempts, purpose: otp.purpose || '' };
    await user.save();
    return attempts >= MAX_OTP_ATTEMPTS
      ? 'Too many wrong codes. Please request a new one.'
      : 'Invalid 6-digit verification code.';
  }
  codeLockout.recordSuccess(`code:${user._id}`, ip);
  return null;
}

// 429 response when this account is locked for wrong codes, else null
function codeLocked(res, user) {
  const status = codeLockout.status(`code:${user._id}`, clientIp(res.req));
  return status.locked ? lockedResponse(res, status) : null;
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
    // Password change / reset, ban or role change bumps tokenVersion and ends older sessions
    if (!authService.isTokenCurrent(decoded, user)) {
      return res.status(401).json({ error: 'Unauthorized: Session expired. Please sign in again.' });
    }
    if (user.isBanned) {
      return res.status(403).json({ error: 'This account has been suspended. Please contact support.' });
    }
    if (decoded.impersonatedBy) {
      // An impersonation session lives only while the superadmin who started it still qualifies
      const admin = mongoose.isValidObjectId(decoded.impersonatedBy) ? await User.findById(decoded.impersonatedBy) : null;
      if (!admin || admin.role !== 'superadmin' || admin.isBanned
        || (Number(decoded.impersonatorTokenVersion) || 0) !== (Number(admin.tokenVersion) || 0)) {
        return res.status(401).json({ error: 'Unauthorized: Impersonation session is no longer valid.' });
      }
      req.impersonatedBy = admin._id.toString();
    }
    req.user = user;
    req.tokenClaims = decoded;
    next();
  } catch (err) {
    // A database hiccup is not an expired session: 401 here would sign every user out
    console.error('requireAuth:', err.message);
    return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
  }
};

/**
 * POST /api/auth/register/request-otp
 * Step 1: Validate registration details and dispatch 6-digit email verification OTP
 */
router.post('/register/request-otp', registerIpLimit, async (req, res) => {
  try {
    const body = req.body || {};
    const fields = ['email', 'username', 'password', 'firstName', 'lastName', 'mobileNumber', 'whatsappNumber', 'instagramUsername', 'instagramId'];
    const v = {};
    for (const f of fields) {
      v[f] = asString(body[f]);
      if (v[f] === null) return res.status(400).json({ error: `${f} must be text.` });
    }
    const { email, username, firstName, lastName, mobileNumber, whatsappNumber, instagramUsername, instagramId } = v;
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !email.includes('@') || email.length > 254) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    if (password.length > 200) {
      return res.status(400).json({ error: 'Password is too long.' });
    }

    const cleanEmail = email.toLowerCase();
    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 40);
    const cleanIgHandle = instagramUsername.replace(/^@/, '').toLowerCase();
    if (cleanUsername.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters (letters, numbers, _ or .).' });
    }

    // A pending (unverified) account is matched by email only, so nobody can take over
    // someone else's pending sign-up by reusing their username
    const existing = await User.findOne({ email: cleanEmail });
    if (existing && existing.isVerified !== false) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    }
    const usernameTaken = await User.exists({ username: cleanUsername, ...(existing ? { _id: { $ne: existing._id } } : {}) });
    if (usernameTaken) {
      return res.status(409).json({ error: 'This username is already taken. Please choose another.' });
    }
    if (!emailSendAllowed(cleanEmail)) return tooManyEmails(res);

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
    const otpCode = newOtpCode();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const passwordHash = await User.hashPassword(password);
    const totpSecret = authService.generateTotpSecret();

    let user = existing;
    if (!user) {
      user = new User({
        email: cleanEmail,
        username: cleanUsername,
        passwordHash,
        firstName,
        lastName,
        mobileNumber,
        whatsappNumber,
        instagramUsername: cleanIgHandle || '',
        instagramId,
        role: 'user',
        isVerified: false,
        verificationOtp: {
          code: otpCode,
          expiresAt: otpExpires,
        },
        twoFactor: {
          enabled: false, // switched on when the user opens the OneAuth QR
          secret: totpSecret,
        },
      });
    } else {
      user.username = cleanUsername;
      user.passwordHash = passwordHash;
      user.firstName = firstName;
      user.lastName = lastName;
      user.mobileNumber = mobileNumber;
      user.whatsappNumber = whatsappNumber;
      user.instagramUsername = cleanIgHandle || user.instagramUsername || '';
      if (instagramId) user.instagramId = instagramId;
      user.role = existing.role || 'user';
      user.isVerified = false;
      user.verificationOtp = {
        code: otpCode,
        expiresAt: otpExpires,
      };
      if (!user.twoFactor?.secret) {
        user.twoFactor = {
          enabled: false, // switched on when the user opens the OneAuth QR
          secret: totpSecret,
        };
      }
    }

    try {
      await user.save();
    } catch (saveErr) {
      if (saveErr?.code === 11000) {
        return res.status(409).json({ error: 'This email or username is already taken. Please choose another or sign in.' });
      }
      throw saveErr;
    }

    // Send verification email
    try {
      await authService.sendOtpEmail(cleanEmail, otpCode, 'Account Verification');
      res.json({
        success: true,
        message: `A 6-digit verification code was sent to ${cleanEmail}. Please check your inbox.`,
        email: cleanEmail,
      });
    } catch (mailErr) {
      console.error('❌ [Register OTP] Email sending failed:', mailErr.message);
      return res.status(502).json({ error: 'We could not send the verification email. Please try again later.' });
    }
  } catch (err) {
    return serverError(res, 'Registration Request OTP error', err);
  }
});

/**
 * POST /api/auth/register/resend-otp
 * Resend OTP to email address for pending unverified accounts
 */
router.post('/register/resend-otp', sendIpLimit, async (req, res) => {
  try {
    const email = asString(req.body?.email);
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }
    const cleanEmail = email.toLowerCase();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ error: 'No account found with this email.' });
    }
    if (user.isVerified !== false) {
      return res.status(409).json({ error: 'This account is already verified. Please sign in.' });
    }
    if (!emailSendAllowed(cleanEmail)) return tooManyEmails(res);

    const otpCode = newOtpCode();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.verificationOtp = {
      code: otpCode,
      expiresAt: otpExpires,
      attempts: 0,
    };
    await user.save();

    try {
      await authService.sendOtpEmail(cleanEmail, otpCode, 'Account Verification');
      res.json({
        success: true,
        message: `A fresh 6-digit verification code has been sent to ${cleanEmail}. Please check your inbox.`,
        email: cleanEmail,
      });
    } catch (mailErr) {
      console.error('❌ [Resend OTP] Email sending failed:', mailErr.message);
      return res.status(502).json({ error: 'We could not send the verification email. Please try again later.' });
    }
  } catch (err) {
    return serverError(res, 'Resend OTP error', err);
  }
});

/**
 * POST /api/auth/register/verify-otp
 * Step 1.5: Confirm OTP, mark account as verified, and return authenticated session
 */
router.post('/register/verify-otp', codeIpLimit, async (req, res) => {
  try {
    const email = asString(req.body?.email);
    const otpCode = req.body?.otpCode;
    if (!email || email === null || otpCode === undefined || otpCode === null || otpCode === '') {
      return res.status(400).json({ error: 'Email and 6-digit verification code are required.' });
    }

    const cleanEmail = email.toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (!user || !user.verificationOtp?.code) {
      return res.status(400).json({ error: 'No pending verification request found for this email.' });
    }
    const locked = codeLocked(res, user);
    if (locked) return locked;
    const otpError = await checkOtp(user, 'verificationOtp', otpCode, '', req);
    if (otpError) return res.status(400).json({ error: otpError });
    // The code alone is not enough: anyone can restart a pending sign-up with their own
    // password, so the browser must also prove it knows the password this code was sent for
    const signupPassword = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!signupPassword || !(await user.comparePassword(signupPassword))) {
      user.verificationOtp = { code: '', expiresAt: null, attempts: 0 };
      await user.save();
      return res.status(400).json({ error: 'This sign-up was restarted with different details. Please request a new code.' });
    }
    if (user.isBanned) {
      return res.status(403).json({ error: 'This account has been suspended. Please contact support.' });
    }

    user.isVerified = true;
    user.verificationOtp = { code: '', expiresAt: null, attempts: 0 };
    user.lastLogin = new Date();
    await user.save();

    const token = authService.generateToken(user);

    res.json({
      success: true,
      token,
      message: 'Account verified successfully!',
      user: sessionUser(user),
    });
  } catch (err) {
    return serverError(res, 'Registration Verify OTP error', err);
  }
});

/**
 * POST /api/auth/login
 * Standard login: Direct password verification.
 * (OneAuth / TOTP is an alternative login method, NOT enforced on password login)
 */
router.post('/login', loginIpLimit, async (req, res) => {
  try {
    const identifier = asString(req.body?.identifier);
    const { password, totpCode } = req.body || {};
    if (identifier === null || (password !== undefined && password !== null && typeof password !== 'string')) {
      return res.status(400).json({ error: 'Email/username and password must be text.' });
    }
    if (!identifier) {
      return res.status(400).json({ error: 'Email or Username is required' });
    }

    // If totpCode is provided without password, route to OneAuth passwordless login
    if (!password && totpCode) {
      return await handleOneAuthDirectLogin(req, res, identifier, totpCode);
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const cleanIdentifier = identifier.toLowerCase();
    const user = await User.findOne({
      $or: [{ email: cleanIdentifier }, { username: cleanIdentifier }]
    });

    if (!user) {
      if (typeof password === 'string') await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const lockKey = `pw:${user._id}`;
    const lock = passwordLockout.status(lockKey, clientIp(req));
    if (lock.locked) return lockedResponse(res, lock);

    // Count the try before the slow password check so parallel guesses cannot all slip past
    // the cap; a correct password clears it again just below
    const after = passwordLockout.recordFailure(lockKey, clientIp(req));
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      if (after.locked) return lockedResponse(res, after);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    passwordLockout.recordSuccess(lockKey, clientIp(req));
    const blocked = signInBlocked(res, user);
    if (blocked) return blocked;

    user.lastLogin = new Date();
    await user.save();

    const token = authService.generateToken(user);

    res.json({
      success: true,
      token,
      user: sessionUser(user),
    });
  } catch (err) {
    return serverError(res, 'Login error', err);
  }
});

/**
 * Helper to execute direct Zoho OneAuth login
 * Each code works once, and 5 wrong codes lock the account for 15 minutes.
 */
async function handleOneAuthDirectLogin(req, res, identifier, code) {
  const cleanIdentifier = String(identifier).trim().toLowerCase();
  const cleanCode = (typeof code === 'string' || typeof code === 'number') ? String(code).trim() : '';

  if (!cleanCode || !/^\d{6}$/.test(cleanCode)) {
    return res.status(400).json({ error: 'Please enter the 6-digit verification code from your Zoho OneAuth app' });
  }

  const user = await User.findOne({
    $or: [{ email: cleanIdentifier }, { username: cleanIdentifier }]
  });

  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired 6-digit code from Zoho OneAuth app. Please check your app and try again.' });
  }

  const locked = codeLocked(res, user);
  if (locked) return locked;

  if (!user.twoFactor?.secret) {
    return res.status(400).json({
      error: 'Zoho OneAuth is not configured on this account yet. Please log in with password or passkey first to scan the QR code.',
      needsSetup: true,
    });
  }

  const result = await authService.consumeTotp(user, cleanCode);
  if (result !== 'ok') {
    // No code can be right before OneAuth is switched on, so those tries never lock the real owner out
    if (user.twoFactor.enabled === false) {
      return res.status(401).json({ error: 'Invalid or expired 6-digit code from Zoho OneAuth app. Please check your app and try again.' });
    }
    const after = codeLockout.recordFailure(`code:${user._id}`, clientIp(req));
    if (after.locked) return lockedResponse(res, after);
    return res.status(401).json({
      error: result === 'replayed'
        ? 'This code was already used. Please wait for the next code in your Zoho OneAuth app.'
        : 'Invalid or expired 6-digit code from Zoho OneAuth app. Please check your app and try again.',
    });
  }
  codeLockout.recordSuccess(`code:${user._id}`, clientIp(req));

  const blocked = signInBlocked(res, user);
  if (blocked) return blocked;

  user.lastLogin = new Date();
  await user.save();

  const token = authService.generateToken(user);
  return res.json({
    success: true,
    token,
    user: sessionUser(user),
  });
}

/**
 * POST /api/auth/oneauth-login
 * Dedicated direct passwordless login using Zoho OneAuth 6-digit code
 */
router.post('/oneauth-login', loginIpLimit, async (req, res) => {
  try {
    const identifier = asString(req.body?.identifier);
    const code = req.body?.code;
    if (!identifier || !code) {
      return res.status(400).json({ error: 'Email/Username and 6-digit OneAuth code are required' });
    }
    return await handleOneAuthDirectLogin(req, res, identifier, code);
  } catch (err) {
    return serverError(res, 'OneAuth login error', err);
  }
});

/**
 * POST /api/auth/oneauth/request-setup-otp
 * Allows unauthenticated owner to verify identity via email OTP to retrieve Zoho OneAuth QR code
 */
router.post('/oneauth/request-setup-otp', sendIpLimit, async (req, res) => {
  try {
    const rawEmail = asString(req.body?.email);
    if (rawEmail === null) return res.status(400).json({ error: 'Email or username must be text' });
    const cleanEmail = rawEmail.toLowerCase();
    if (!cleanEmail) return res.status(400).json({ error: 'Email or username is required' });
    const user = await User.findOne({ $or: [{ email: cleanEmail }, { username: cleanEmail }] });
    const genericOk = { success: true, message: 'If this account exists, a 6-digit code has been sent to its email to unlock OneAuth setup.' };
    // Same answers (including the send limit) for real and unknown accounts, so this route does not reveal which exist
    if (!emailSendAllowed(user ? user.email : cleanEmail)) return tooManyEmails(res);
    if (!user) return res.json(genericOk);

    const otpCode = newOtpCode();
    user.resetOtp = {
      code: otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
      purpose: 'oneauth_setup',
    };
    await user.save();

    try {
      await authService.sendOtpEmail(user.email, otpCode, 'Zoho OneAuth Setup');
    } catch (mailErr) {
      console.error('❌ [OneAuth Setup OTP] Email sending failed:', mailErr.message);
      return res.status(502).json({ error: 'We could not send the verification email. Please try again later.' });
    }
    res.json(genericOk);
  } catch (err) {
    return serverError(res, 'Request OneAuth Setup OTP error', err);
  }
});

/**
 * POST /api/auth/oneauth/verify-setup-otp
 * Verifies email OTP and returns the QR code & secret to link Zoho OneAuth app
 */
router.post('/oneauth/verify-setup-otp', codeIpLimit, async (req, res) => {
  try {
    const { otpCode } = req.body || {};
    const cleanEmail = (asString(req.body?.email) || '').toLowerCase();
    const user = cleanEmail ? await User.findOne({ $or: [{ email: cleanEmail }, { username: cleanEmail }] }) : null;

    if (!user || !user.resetOtp?.code) {
      return res.status(400).json({ error: 'Invalid or expired setup request' });
    }
    const locked = codeLocked(res, user);
    if (locked) return locked;
    const otpError = await checkOtp(user, 'resetOtp', otpCode, 'oneauth_setup', req);
    if (otpError) return res.status(400).json({ error: otpError });

    // Reset OTP code and always issue a fresh authenticator secret: the new QR is shown below, and
    // anyone who saw an older secret loses passwordless access
    user.resetOtp = { code: '', expiresAt: null, attempts: 0 };
    const { generateSecret } = require('otplib');
    user.twoFactor = user.twoFactor || {};
    user.twoFactor.secret = generateSecret();
    user.twoFactor.lastUsedStep = 0;
    user.twoFactor.enabled = true;
    await user.save();

    // Return QR code and secret
    const totpData = await authService.getTotpQrCode(user);
    res.json({
      success: true,
      ...totpData,
    });
  } catch (err) {
    return serverError(res, 'Verify OneAuth Setup OTP error', err);
  }
});
;

/**
 * POST /api/auth/forgot-password/verify-oneauth
 * Reset password instantly using Zoho OneAuth code (bypasses email timeouts completely)
 */
router.post('/forgot-password/verify-oneauth', codeIpLimit, async (req, res) => {
  try {
    const identifier = asString(req.body?.identifier);
    const { totpCode, newPassword } = req.body || {};
    if (identifier === null || (newPassword !== undefined && typeof newPassword !== 'string')) {
      return res.status(400).json({ error: 'Username/Email and new password must be text' });
    }
    if (!identifier || !totpCode || !newPassword) {
      return res.status(400).json({ error: 'Username/Email, OneAuth code, and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const cleanIdentifier = identifier.toLowerCase();
    const user = await User.findOne({
      $or: [{ email: cleanIdentifier }, { username: cleanIdentifier }]
    });

    if (!user || !user.twoFactor?.secret) {
      return res.status(400).json({ error: 'OneAuth not configured for this account' });
    }
    const locked = codeLocked(res, user);
    if (locked) return locked;

    const result = await authService.consumeTotp(user, totpCode);
    if (result !== 'ok') {
      const after = codeLockout.recordFailure(`code:${user._id}`, clientIp(req));
      if (after.locked) return lockedResponse(res, after);
      return res.status(401).json({
        error: result === 'replayed'
          ? 'This code was already used. Please wait for the next code in your OneAuth app.'
          : 'Invalid 6-digit OneAuth code. Check your app and try again.',
      });
    }
    codeLockout.recordSuccess(`code:${user._id}`, clientIp(req));
    passwordLockout.recordSuccess(`pw:${user._id}`, clientIp(req));

    user.passwordHash = await User.hashPassword(newPassword);
    authService.bumpTokenVersion(user); // sign out every existing session
    await user.save();

    res.json({ success: true, message: 'Password reset successfully! You can now log in.' });
  } catch (err) {
    return serverError(res, 'OneAuth password reset error', err);
  }
});

/**
 * POST /api/auth/forgot-password/send-otp
 * Generates and sends a 6-digit OTP code to Sam's email
 */
router.post('/forgot-password/send-otp', sendIpLimit, async (req, res) => {
  try {
    const email = asString(req.body?.email);
    if (email === null) return res.status(400).json({ error: 'Email must be text' });
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const cleanEmail = email.toLowerCase();
    const genericOk = { success: true, message: 'If this email exists, a verification code has been sent.' };
    const user = await User.findOne({ email: cleanEmail });
    // Same answers (including the send limit) for real and unknown emails, so this route does not reveal which exist
    if (!emailSendAllowed(cleanEmail)) return tooManyEmails(res);
    if (!user) return res.json(genericOk);

    // Generate secure 6-digit OTP
    const otpCode = newOtpCode();
    user.resetOtp = {
      code: otpCode,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      attempts: 0,
      purpose: 'reset',
    };
    await user.save();

    // Send verification email
    try {
      await authService.sendOtpEmail(user.email, otpCode, 'Password Reset');
      res.json(genericOk);
    } catch (mailErr) {
      console.error('❌ [Password Reset OTP] Email delivery failed:', mailErr.message);
      return res.status(502).json({ error: 'We could not send the verification email. Please try again later.' });
    }
  } catch (err) {
    return serverError(res, 'Send OTP error', err, 'Error generating password reset code');
  }
});

/**
 * POST /api/auth/forgot-password/verify-reset
 * Verifies OTP and updates user password
 */
router.post('/forgot-password/verify-reset', codeIpLimit, async (req, res) => {
  try {
    const email = asString(req.body?.email);
    const { otpCode, newPassword } = req.body || {};
    if (email === null || (newPassword !== undefined && typeof newPassword !== 'string')) {
      return res.status(400).json({ error: 'Email and new password must be text' });
    }
    if (!email || !otpCode || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP code, and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const cleanEmail = email.toLowerCase();
    const user = await User.findOne({ email: cleanEmail });
    if (!user || !user.resetOtp?.code) {
      return res.status(400).json({ error: 'Invalid or expired verification request' });
    }
    const locked = codeLocked(res, user);
    if (locked) return locked;
    const otpError = await checkOtp(user, 'resetOtp', otpCode, 'reset', req);
    if (otpError) return res.status(400).json({ error: otpError });

    user.passwordHash = await User.hashPassword(newPassword);
    user.resetOtp = { code: '', expiresAt: null, attempts: 0 };
    authService.bumpTokenVersion(user); // sign out every existing session
    await user.save();
    passwordLockout.recordSuccess(`pw:${user._id}`, clientIp(req));

    res.json({ success: true, message: 'Password reset successfully! You can now log in.' });
  } catch (err) {
    return serverError(res, 'Verify Reset error', err);
  }
});

/**
 * GET /api/auth/passkey/login-options
 * Generates WebAuthn options for Passkey / Fingerprint login
 */
router.get('/passkey/login-options', passkeyIpLimit, async (req, res) => {
  try {
    const rawId = (asString(req.query.email) || asString(req.query.identifier) || '').toLowerCase();
    let user = null;
    if (rawId) {
      user = await User.findOne({
        $or: [{ email: rawId }, { username: rawId }]
      });
    }
    const options = await authService.generatePasskeyAuthenticationOptions(user, req, rawId);
    res.json(options);
  } catch (err) {
    return serverError(res, 'Passkey login options error', err, 'Could not start passkey sign-in.');
  }
});

/**
 * POST /api/auth/passkey/login-verify
 * Verifies biometric assertion and logs user in
 */
router.post('/passkey/login-verify', passkeyIpLimit, async (req, res) => {
  try {
    const { response } = req.body || {};
    if (!response || typeof response !== 'object' || typeof response.id !== 'string') {
      return res.status(400).json({ error: 'Assertion response is required' });
    }

    let user = null;
    const cleanId = (asString(req.body.email) || asString(req.body.identifier) || '').toLowerCase();
    if (cleanId) {
      user = await User.findOne({
        $or: [{ email: cleanId }, { username: cleanId }]
      });
    }
    if (!user) {
      user = await User.findOne({ 'passkeys.credentialId': response.id });
    }
    if (!user) {
      return res.status(404).json({ error: 'No user registered with this passkey' });
    }

    let verified = false;
    try {
      verified = await authService.verifyPasskeyAuthentication(user, response, req);
    } catch (verifyErr) {
      if (verifyErr instanceof PasskeyError) return res.status(400).json({ error: verifyErr.message });
      console.warn('⚠️ Passkey assertion rejected:', verifyErr.message);
      return res.status(401).json({ error: 'Passkey verification failed' });
    }
    if (!verified) {
      return res.status(401).json({ error: 'Passkey verification failed' });
    }
    const blocked = signInBlocked(res, user);
    if (blocked) return blocked;

    const token = authService.generateToken(user);

    res.json({
      success: true,
      token,
      user: sessionUser(user),
    });
  } catch (err) {
    return serverError(res, 'Passkey login verify error', err);
  }
});

/**
 * POST /api/auth/passkey/register-options (Protected)
 * Starts passkey registration for current user
 */
// Credential setup is for the account owner only, never for an impersonation session
const ownerSessionOnly = (req, res, next) => (req.impersonatedBy
  ? res.status(403).json({ error: 'Not available while viewing another workspace.' })
  : next());

router.post('/passkey/register-options', requireAuth, ownerSessionOnly, async (req, res) => {
  try {
    const options = await authService.generatePasskeyRegistrationOptions(req.user, req);
    res.json(options);
  } catch (err) {
    return serverError(res, 'Passkey register options error', err, 'Could not start passkey setup.');
  }
});

/**
 * POST /api/auth/passkey/register-verify (Protected)
 * Completes passkey registration for current user
 */
router.post('/passkey/register-verify', requireAuth, ownerSessionOnly, async (req, res) => {
  try {
    const { response, name } = req.body || {};
    if (!response) return res.status(400).json({ error: 'Registration response required' });

    const verified = await authService.verifyPasskeyRegistration(req.user, response, req);
    if (!verified) {
      return res.status(400).json({ error: 'Failed to verify passkey registration' });
    }

    // Set device name from client or detect dynamically from User-Agent
    const userAgent = req.get('user-agent') || '';
    let resolvedName = typeof name === 'string' ? name.trim().slice(0, 60) : '';
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
    return serverError(res, 'Passkey register verify error', err, 'Failed to verify passkey registration.');
  }
});

/**
 * GET /api/auth/totp-setup (Protected)
 * Returns QR code and secret for setting up Zoho OneAuth app
 */
router.get('/totp-setup', requireAuth, ownerSessionOnly, async (req, res) => {
  try {
    // Opening the QR is how OneAuth gets switched on for this account
    if (!req.user.twoFactor?.secret || !req.user.twoFactor?.enabled) {
      req.user.twoFactor = req.user.twoFactor || {};
      if (!req.user.twoFactor.secret) req.user.twoFactor.secret = authService.generateTotpSecret();
      req.user.twoFactor.enabled = true;
      await req.user.save();
    }
    const totpData = await authService.getTotpQrCode(req.user);
    res.json({
      success: true,
      ...totpData,
    });
  } catch (err) {
    return serverError(res, 'Auth route error', err);
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
    username: user.username,
    email: user.email,
    profilePicUrl: user.profilePicUrl || '',
    firstName: user.firstName,
    lastName: user.lastName,
    mobileNumber: user.mobileNumber,
    whatsappNumber: user.whatsappNumber,
    instagramUsername: user.instagramUsername,
    instagramId: user.instagramId || '',
    instagramAccountId: user.instagramAccountId || user.instagram?.accountId || '',
    role: isSuper ? 'superadmin' : 'user',
    accountType: user.accountType,
    isOnboarded: user.isOnboarded ?? false,
    businessProfile: user.businessProfile || null,
    hasInstagramToken: hasIgToken(user),
    isInstagramConnected: hasIgToken(user),
    igApprovalStatus: user.igApprovalStatus || (hasIgToken(user) ? 'approved' : 'none'),
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

// Instagram account ids a pasted access token really belongs to (empty when the token is invalid).
// Same check as PUT /api/persona: an account id is only accepted when it is proven.
async function accountIdsForToken(token) {
  const { INSTAGRAM_GRAPH_URL, FACEBOOK_GRAPH_URL } = require('../services/graphApi');
  const ids = new Set();
  try {
    const ig = await axios.get(`${INSTAGRAM_GRAPH_URL}/me`, {
      params: { fields: 'id,user_id,username', access_token: token }, timeout: 8000,
    });
    [ig.data?.id, ig.data?.user_id].forEach(v => v && ids.add(String(v)));
  } catch (_) { /* not an Instagram Login token */ }
  if (!ids.size) {
    try {
      const fb = await axios.get(`${FACEBOOK_GRAPH_URL}/me`, {
        params: { fields: 'id,instagram_business_account', access_token: token }, timeout: 8000,
      });
      const igb = fb.data?.instagram_business_account?.id;
      if (igb) ids.add(String(igb));
    } catch (_) { /* invalid token */ }
  }
  return [...ids];
}

/**
 * POST /api/auth/onboarding (Protected)
 * Configures new user account: Business vs Personal, AI Persona Tone, Chat Rules & Automation
 */
router.post('/onboarding', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const {
      accountType, // 'business' | 'personal' | 'creator'
      businessProfile, // business: { businessName, category, description, website }; creator: { creatorBio, textingHabits, memeStyle }
      personaTone, // 'professional' | 'witty' | 'friendly' | 'roast'
      greetingMessage,
      chatMode, // 'everyone' | 'everyone_except' | 'only_selected'
      enableGlobalBot, // boolean
      instagramUsername,
      instagramPageAccessToken,
      instagramAccountId,
    } = req.body || {};

    const VALID_ACCOUNT_TYPES = ['personal', 'creator', 'business', 'agency'];
    if (accountType !== undefined && accountType !== null && accountType !== '' && !VALID_ACCOUNT_TYPES.includes(accountType)) {
      return res.status(400).json({ error: `accountType must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}.` });
    }
    for (const [name, value] of Object.entries({ instagramUsername, instagramPageAccessToken })) {
      if (value !== undefined && value !== null && typeof value !== 'string') {
        return res.status(400).json({ error: `${name} must be text.` });
      }
    }
    if (instagramAccountId !== undefined && instagramAccountId !== null && !['string', 'number'].includes(typeof instagramAccountId)) {
      return res.status(400).json({ error: 'instagramAccountId must be text.' });
    }

    // An Instagram account can belong to one workspace only; check before storing anything
    const cleanAccountId = instagramAccountId !== undefined && instagramAccountId !== null ? String(instagramAccountId).trim() : undefined;
    if (cleanAccountId) {
      // Only an account this user has proven: already linked by the Connect button, or owned by the
      // token pasted with it. A typed-in id used to route another account's DMs to this workspace.
      const provenIds = [user.instagram?.accountId, user.instagramAccountId].map(v => String(v || '').trim()).filter(Boolean);
      const pastedToken = typeof instagramPageAccessToken === 'string' ? instagramPageAccessToken.trim() : '';
      if (!provenIds.includes(cleanAccountId) && !(pastedToken && (await accountIdsForToken(pastedToken)).includes(cleanAccountId))) {
        return res.status(400).json({
          error: 'This Instagram account id could not be verified. Connect Instagram with the Connect button, or paste a valid access token for this account.',
        });
      }
      const conflictingUser = await User.exists({
        _id: { $ne: user._id },
        // instagramId alone is an unproven sign-up claim; the token above proves this owner
        $or: [{ instagramAccountId: cleanAccountId }, { 'instagram.accountId': cleanAccountId }],
      });
      if (conflictingUser) {
        return res.status(409).json({ error: 'This Instagram account is already linked to another workspace.' });
      }
    }

    if (accountType) {
      user.accountType = accountType;
    }
    if (instagramUsername) {
      user.instagramUsername = instagramUsername.trim().replace(/^@/, '');
    }
    // Store pasted tokens encrypted; a blank field means "unchanged"
    if (instagramPageAccessToken && instagramPageAccessToken.trim()) {
      setUserInstagram(user, { token: instagramPageAccessToken.trim(), accountId: cleanAccountId || '' });
    }
    // Blank means "unchanged": the wizard sends '' after an OAuth connect (it only knows instagramId)
    if (cleanAccountId) {
      user.instagramAccountId = cleanAccountId;
    }
    const bpIn = businessProfile && typeof businessProfile === 'object' ? businessProfile : {};
    const txt = (v) => (typeof v === 'string' ? v.trim() : '');
    if (['businessName', 'category', 'description'].some(k => typeof bpIn[k] === 'string')) {
      // Only overwrite the fields that were sent (the creator form must not wipe business details)
      const bp = user.businessProfile || {};
      const pick = (k) => (typeof bpIn[k] === 'string' ? bpIn[k].trim() : (bp[k] || ''));
      user.businessProfile = {
        businessName: pick('businessName'),
        category: pick('category'),
        description: pick('description'),
      };
    }
    user.isOnboarded = true;
    await user.save();

    // Save the onboarding choices on this account's own persona (chat mode and bot switch live there too)
    try {
      const PersonaConfig = require('../models/PersonaConfig');
      let persona = await PersonaConfig.findOne({ ownerId: user._id });
      if (!persona) {
        // Seed from this account, never the schema defaults (they describe the original owner)
        persona = new PersonaConfig({ ownerId: user._id, ...PersonaConfig.starterFields(user) });
      }
      // Creator answers go into the fields the AI reads
      if (txt(bpIn.creatorBio)) {
        persona.aboutMe = txt(bpIn.creatorBio);
        persona.personaBio = txt(bpIn.creatorBio);
      }
      if (txt(bpIn.textingHabits)) persona.textingHabits = txt(bpIn.textingHabits);
      if (txt(bpIn.memeStyle)) {
        persona.replyRules = `${persona.replyRules || ''}
Meme / reaction style: ${txt(bpIn.memeStyle)}`.trim();
      }
      if (txt(bpIn.website) && !String(persona.customKnowledge || '').includes(txt(bpIn.website))) {
        persona.customKnowledge = [persona.customKnowledge, `Website: ${txt(bpIn.website)}`].filter(Boolean).join('\n');
      }
      if (['personal', 'creator', 'business', 'agency'].includes(accountType)) {
        persona.accountType = accountType;
      }
      if (personaTone && typeof personaTone === 'string') {
        persona.toneGuidelines = `Overall tone: ${personaTone.trim()}.
${persona.toneGuidelines || ''}`.trim();
      }
      if (greetingMessage && typeof greetingMessage === 'string') {
        persona.replyRules = `Greeting for a new chat: "${greetingMessage.trim()}".
${persona.replyRules || ''}`.trim();
      }
      if (['everyone', 'everyone_except', 'only_selected', 'paused'].includes(chatMode)) {
        persona.chatMode = chatMode;
      }
      if (typeof enableGlobalBot === 'boolean') {
        persona.globalBotActive = enableGlobalBot;
      }
      await persona.save();
      await redisService.invalidatePersonaConfig();
    } catch (e) {
      console.warn('Could not update persona during onboarding:', e.message);
    }

    res.json({
      success: true,
      message: 'Onboarding configured successfully!',
      user: {
        id: user._id,
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
        hasInstagramToken: hasIgToken(user),
      }
    });
  } catch (err) {
    return serverError(res, 'Onboarding error', err, 'Failed to complete onboarding.');
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
    return serverError(res, 'Skip onboarding error', err, 'Failed to skip onboarding.');
  }
});

/**
 * POST /api/auth/instagram/connect-ticket
 * Gives the signed-in app a 2-minute, single-use ticket for the connect popup,
 * so the session JWT never has to travel in a URL (history, proxy and server logs).
 */
const CONNECT_TICKET_TTL_SECONDS = 120;
router.post('/instagram/connect-ticket', oauthIpLimit, requireAuth, async (req, res) => {
  try {
    const ticket = crypto.randomBytes(32).toString('hex');
    await redisService.set(`ig_connect_ticket:${ticket}`, { userId: req.user._id.toString() }, CONNECT_TICKET_TTL_SECONDS);
    res.json({ ticket, expiresIn: CONNECT_TICKET_TTL_SECONDS });
  } catch (err) {
    return serverError(res, 'Connect ticket error', err, 'Could not start the Instagram connection.');
  }
});

/**
 * GET /api/auth/instagram/connect
 * Redirects to Meta OAuth login dialog for in-app Instagram connection
 */
router.get('/instagram/connect', oauthIpLimit, async (req, res) => {
  try {
    // Instagram Login needs the Instagram App ID (Meta dashboard > Instagram > API setup with
    // Instagram login), NOT the Facebook/Meta App ID; the Meta ID gives "Invalid platform app"
    const metaAppId = (process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID || '').trim();
    if (!metaAppId) {
      return res.status(500).send('Instagram connection is not configured (INSTAGRAM_APP_ID is missing).');
    }
    if (process.env.META_APP_ID && metaAppId === process.env.META_APP_ID.trim()) {
      console.warn('⚠️ INSTAGRAM_APP_ID equals META_APP_ID. Instagram Login will fail with "Invalid platform app"; set INSTAGRAM_APP_ID to the Instagram App ID from Meta dashboard > Instagram > API setup with Instagram login.');
    }
    const clientOrigin = safeClientOrigin(asString(req.query.origin));

    // Preferred: a single-use ticket from POST /instagram/connect-ticket (no JWT in the URL)
    let userId = null;
    const ticket = asString(req.query.ticket);
    if (ticket) {
      const ticketKey = /^[0-9a-f]{64}$/.test(ticket) ? `ig_connect_ticket:${ticket}` : null;
      const saved = ticketKey ? await redisService.get(ticketKey) : null;
      if (ticketKey) await redisService.del(ticketKey);
      const ticketUser = saved?.userId && mongoose.isValidObjectId(saved.userId) ? await User.findById(saved.userId) : null;
      if (!ticketUser || ticketUser.isBanned) {
        return res.status(401).send('This connection link has expired. Please close this window and try again.');
      }
      userId = ticketUser._id.toString();
    }

    // The old ?token=<session JWT> form is no longer accepted: a 30-day link someone else sends
    // you would connect YOUR Instagram to THEIR workspace. The app uses single-use tickets.

    let backendUrl = process.env.BACKEND_URL || (req.headers.host ? `https://${req.headers.host}` : 'https://instagram-ai-bot-64tf.onrender.com');
    backendUrl = backendUrl.replace(/\/+$/, '').replace(/^http:\/\/(.*onrender\.com)/i, 'https://$1');
    const redirectUri = `${backendUrl}/api/auth/instagram/callback`;

    // Opaque single-use state; the session data stays server-side
    const state = crypto.randomBytes(32).toString('hex');
    // CSRF: the browser that starts the flow gets a random nonce cookie; the callback must bring it back
    const nonce = crypto.randomBytes(32).toString('hex');
    await redisService.set(`oauth_state:${state}`, {
      userId,
      origin: clientOrigin,
      redirectUri,
      appId: metaAppId,
      nonceHash: sha256(nonce),
    }, OAUTH_STATE_TTL_SECONDS);
    res.cookie(OAUTH_NONCE_COOKIE, nonce, {
      httpOnly: true,
      secure: req.secure || redirectUri.startsWith('https://'),
      sameSite: 'lax',
      path: '/api/auth/instagram',
      maxAge: OAUTH_STATE_TTL_SECONDS * 1000,
    });

    // The Meta app uses "Instagram API with Instagram Login" (IGAA tokens); the old Facebook Login
    // scopes (instagram_basic, pages_*) are rejected by this app as "Invalid Scopes"
    const scopes = [
      'instagram_business_basic',
      'instagram_business_manage_messages'
    ].join(',');

    const authUrl = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_reauth=true&client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;

    res.redirect(authUrl);
  } catch (err) {
    console.error('❌ /instagram/connect error:', err.message);
    res.status(500).send('Failed to initiate Instagram OAuth. Please try again.');
  }
});

/**
 * GET /api/auth/instagram/callback
 * Exchanges Meta / Instagram OAuth code for Page Access Token & Instagram Business ID
 */
router.get('/instagram/callback', oauthIpLimit, async (req, res) => {
  // Declared outside try so the error page can post back to the saved origin, never "*"
  let origin = DEFAULT_CLIENT_ORIGIN;
  try {
    const code = asString(req.query.code);
    const state = asString(req.query.state);
    const error = asString(req.query.error);
    const error_description = asString(req.query.error_description);

    let stateUserId = null;
    let savedRedirectUri = '';
    let savedAppId = '';

    // Verify and consume the state so a callback URL cannot be replayed
    const stateKey = /^[0-9a-f]{64}$/.test(state || '') ? `oauth_state:${state}` : null;
    const savedState = stateKey ? await redisService.get(stateKey) : null;
    if (!savedState) {
      return res.status(400).send('This connection link is invalid or has expired. Please start the Instagram connection again.');
    }
    await redisService.del(stateKey);
    if (savedState.origin) origin = safeClientOrigin(savedState.origin);
    // The nonce cookie proves this callback belongs to the browser that started the flow
    const cookieNonce = readCookie(req, OAUTH_NONCE_COOKIE);
    res.clearCookie(OAUTH_NONCE_COOKIE, { path: '/api/auth/instagram' });
    if (!nonceMatches(cookieNonce, savedState.nonceHash)) {
      return res.status(400).send(oauthErrorPage({
        title: 'Connection failed',
        heading: 'Could Not Connect',
        message: 'This connection could not be verified. Please start the Instagram connection again from Chatter OS in the same browser.',
        origin,
      }));
    }
    if (savedState.userId) stateUserId = savedState.userId;
    if (savedState.redirectUri) savedRedirectUri = savedState.redirectUri;
    if (savedState.appId) savedAppId = savedState.appId;

    if (error) {
      console.error('❌ Meta OAuth error:', error, error_description);
      return res.send(oauthErrorPage({
        title: 'Authorization failed',
        heading: 'Could Not Connect',
        message: String(error_description || error || 'Authorization was cancelled').slice(0, 300),
        origin,
      }));
    }

    if (!code) {
      return res.status(400).send('No authorization code provided by Meta.');
    }

    // Strip URL fragment #_ from code
    const cleanCode = (code || '').split('#')[0].trim();
    const instagramAppId = savedAppId || process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID || '';
    const metaAppId = process.env.META_APP_ID || '';
    // Instagram Login codes are exchanged with the Instagram App Secret (falls back to the Meta secret)
    const igAppSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || '';
    const metaAppSecret = process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET || '';

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

    // Candidate App IDs: the one the login was started with first, then the configured ones
    const appIdCandidates = Array.from(new Set([
      instagramAppId,
      process.env.INSTAGRAM_APP_ID,
      metaAppId,
    ].map(v => (v || '').trim()))).filter(Boolean);

    let shortLivedToken = '';
    let instagramAccountId = '';
    let instagramUsername = '';
    let facebookPageId = '';
    let needsProfessional = false;
    let lastExchangeError = '';

    // Step 1: Instagram Login token exchange (primary; this app uses Instagram API with Instagram Login)
    {
      for (const testAppId of appIdCandidates) {
        if (shortLivedToken) break;
        for (const uri of redirectUriCandidates) {
          if (shortLivedToken) break;
          try {
            const igFormData = new URLSearchParams();
            igFormData.append('client_id', testAppId);
            igFormData.append('client_secret', igAppSecret);
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

    // Step 1 Fallback: Facebook Graph API token exchange (older Facebook Login codes)
    if (!shortLivedToken) for (const testAppId of appIdCandidates) {
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
          client_secret: igAppSecret,
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
          fields: 'id,user_id,username,name,account_type',
          access_token: longLivedToken
        }
      });
      if (String(profileRes.data?.account_type || '').toUpperCase() === 'PERSONAL') {
        needsProfessional = true;
      } else if (profileRes.data?.username) {
        instagramUsername = profileRes.data.username;
        // user_id is the Instagram professional account ID (1784...) that webhooks use; id is app-scoped
        instagramAccountId = String(profileRes.data.user_id || profileRes.data.id || instagramAccountId);
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
            facebookPageId = page.id;
            instagramAccountId = page.instagram_business_account.id;
            instagramUsername = page.instagram_business_account.username;
            console.log(`✅ [Meta OAuth] Linked via Instagram Business Account: @${instagramUsername} (${instagramAccountId})`);
            break;
          }
        }
        // A Facebook Page without a linked Professional Instagram account cannot receive IG DMs
        if (!instagramAccountId) needsProfessional = true;
      } catch (e) {
        console.warn('⚠️ [Meta OAuth] Pages lookup error:', e.message);
      }
    }

    // No Professional Instagram account linked: send the creator to the guided fix modal (§2.3)
    if (needsProfessional || !instagramAccountId) {
      console.log('ℹ️ [Meta OAuth] No Professional Instagram account linked; showing setup guide');
      const setupError = 'No Instagram Professional account is linked to your Facebook Page yet.';
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Finish Instagram Setup</title></head>
        <body style="font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fafafa;">
          <div style="background: #ffffff; border: 1px solid #e4e4e7; border-radius: 16px; padding: 36px 30px; max-width: 420px; text-align: center;">
            <h2 style="margin: 0 0 8px 0; font-size: 18px;">One quick step left</h2>
            <p style="color: #71717a; font-size: 14px; line-height: 1.5; margin: 0;">${setupError}<br/>Returning to Chatter OS with a 30-second fix...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'INSTAGRAM_OAUTH_ERROR', code: 'no_instagram_linked', error: ${jsValue(setupError)} }, ${jsValue(origin)});
              setTimeout(() => { window.close(); }, 1200);
            } else {
              setTimeout(() => { window.location.href = ${jsValue(`${origin.replace(/\/+$/, '')}/settings?error=no_instagram_linked`)}; }, 1500);
            }
          </script>
        </body>
        </html>
      `);
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

    // 4. Subscribe the Page to webhooks so the creator's DMs reach this server
    const linkedPageToken = longLivedToken;
    if (facebookPageId) {
      try {
        await axios.post(`https://graph.facebook.com/v21.0/${facebookPageId}/subscribed_apps`, null, {
          params: { subscribed_fields: 'messages,messaging_postbacks', access_token: linkedPageToken }
        });
        console.log(`✅ [Meta OAuth] Page ${facebookPageId} subscribed to webhooks`);
      } catch (subErr) {
        console.warn(`⚠️ [Meta OAuth] Webhook subscription failed for Page ${facebookPageId}:`, subErr.response?.data?.error?.message || subErr.message);
      }
    } else if (linkedPageToken.startsWith('IG')) {
      // Instagram Login tokens subscribe the Instagram account itself (no Facebook Page involved)
      try {
        await axios.post('https://graph.instagram.com/v21.0/me/subscribed_apps', null, {
          params: { subscribed_fields: 'messages,messaging_postbacks', access_token: linkedPageToken }
        });
        console.log(`✅ [Instagram Login] @${instagramUsername} subscribed to webhooks`);
      } catch (subErr) {
        console.warn('⚠️ [Instagram Login] Webhook subscription failed:', subErr.response?.data?.error?.message || subErr.message);
      }
    }

    // An Instagram account can belong to one workspace only
    if (instagramAccountId) {
      // Meta just proved this login owns the account: claims nobody proved (an id typed in at sign-up
      // or onboarding) are released instead of locking the real owner out with "Already Linked"
      if (stateUserId) {
        for (const field of ['instagramAccountId', 'instagramId', 'instagram.accountId', 'businessProfile.instagramId']) {
          await User.updateMany(
            { _id: { $ne: stateUserId }, [field]: instagramAccountId, $nor: [{ 'instagram.connected': true, 'instagram.accountId': instagramAccountId }] },
            { $set: { [field]: '' } }
          );
        }
      }
      const linkedElsewhere = await User.exists({
        ...(stateUserId ? { _id: { $ne: stateUserId } } : {}),
        $or: [{ instagramAccountId }, { instagramId: instagramAccountId }, { 'instagram.accountId': instagramAccountId }],
      });
      if (linkedElsewhere) {
        return res.status(409).send(oauthErrorPage({
          title: 'Connection failed',
          heading: 'Already Linked',
          message: 'This Instagram account is already linked to another Chatter OS workspace.',
          origin,
          code: 'already_linked',
        }));
      }
    }

    // 5. Save to the user who started the flow (token encrypted when ENCRYPTION_KEY is set)
    let savedServerSide = false;
    if (stateUserId) {
      try {
        const user = await User.findById(stateUserId);
        if (user) {
          const encrypted = setUserInstagram(user, {
            token: linkedPageToken,
            accountId: instagramAccountId,
            pageId: facebookPageId,
            username: instagramUsername,
          });
          await user.save();
          savedServerSide = true;

          // Sync PersonaConfig as well; it keeps a plaintext copy only when encryption is off
          try {
            const PersonaConfig = require('../models/PersonaConfig');
            // A persona created here starts from this account, never the schema defaults (the original owner)
            const starter = PersonaConfig.starterFields(user);
            if (instagramUsername) delete starter.instagramHandle; // $set below writes it
            await PersonaConfig.findOneAndUpdate(
              { ownerId: user._id },
              {
                $setOnInsert: starter,
                $set: {
                  ownerId: user._id,
                  instagramPageAccessToken: encrypted ? '' : linkedPageToken,
                  instagramAccountId: instagramAccountId,
                  ...(instagramUsername ? { instagramHandle: `@${instagramUsername.replace(/^@/, '')}` } : {}),
                  globalBotActive: true
                }
              },
              { upsert: true, returnDocument: 'after' }
            );
            await redisService.invalidatePersonaConfig();
          } catch (personaErr) {
            console.warn('Could not sync PersonaConfig in OAuth callback:', personaErr.message);
          }
        }
      } catch (e) {
        console.warn('Could not save Instagram connection for user:', e.message);
      }
    }

    const payload = {
      success: true,
      instagramUsername: instagramUsername || '',
      instagramAccountId: instagramAccountId || '',
      // The token only goes back to the browser when it could not be stored server-side
      ...(savedServerSide ? {} : { instagramPageAccessToken: linkedPageToken || '' }),
    };

    // 6. Return auto-closing HTML that posts message to opener
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Instagram Connected</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fafafa; color: #09090b; }
          .card { background: #ffffff; border: 1px solid #e4e4e7; border-radius: 16px; padding: 36px 30px; max-width: 420px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.06); }
          .badge { display: inline-block; background: #dcfce7; color: #15803d; font-weight: 700; font-size: 12px; padding: 4px 10px; border-radius: 999px; margin-bottom: 12px; }
          h2 { margin: 0 0 8px 0; font-size: 20px; }
          p { color: #71717a; font-size: 14px; line-height: 1.5; margin: 0 0 16px 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">SUCCESSFULLY CONNECTED</div>
          <h2>Instagram Account Linked!</h2>
          <p>Connected as <strong>@${escapeHtml(instagramUsername || 'Instagram')}</strong>.<br/>Returning to Chatter OS...</p>
        </div>
        <script>
          const payload = ${jsValue(payload)};
          if (window.opener) {
            window.opener.postMessage({ type: 'INSTAGRAM_OAUTH_SUCCESS', payload }, ${jsValue(origin)});
            setTimeout(() => { window.close(); }, 1200);
          } else {
            setTimeout(() => { window.location.href = ${jsValue(`${origin.replace(/\/+$/, '')}/settings?connected=success`)}; }, 1500);
          }
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('❌ Meta OAuth callback error:', err.response?.data || err.message);
    const errText = String(err.response?.data?.error?.message || err.message || 'Unknown error').slice(0, 300);
    return res.send(oauthErrorPage({
      title: 'Connection failed',
      heading: 'Could Not Retrieve Token',
      message: `${errText} You can also enter your Page Access Token manually in the setup wizard.`,
      origin,
    }));
  }
});

/**
 * POST /api/auth/instagram/disconnect (Protected)
 * Unsubscribes the creator's Page from webhooks and wipes the stored Instagram credentials
 */
router.post('/instagram/disconnect', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const token = getUserInstagramToken(user);
    const pageId = user.instagram?.pageId;

    // Best effort: we only hold a Page token, so stop the Page's webhooks instead of revoking the user's grant
    if (token && pageId) {
      try {
        await axios.delete(`https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`, {
          params: { access_token: token }
        });
      } catch (unsubErr) {
        console.warn(`⚠️ Could not unsubscribe Page ${pageId}:`, unsubErr.response?.data?.error?.message || unsubErr.message);
      }
    }

    clearUserInstagram(user);
    await user.save();

    const PersonaConfig = require('../models/PersonaConfig');
    await PersonaConfig.updateMany({ ownerId: user._id }, { $set: { instagramPageAccessToken: '', instagramAccountId: '' } });
    await redisService.invalidatePersonaConfig();

    res.json({ success: true, message: 'Instagram disconnected' });
  } catch (err) {
    console.error('❌ Instagram disconnect error:', err.message);
    res.status(500).json({ error: 'Failed to disconnect Instagram' });
  }
});

/**
 * PUT /api/auth/profile (Protected)
 * Updates user profile details including profile picture
 */
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { firstName, lastName, mobileNumber, whatsappNumber, instagramUsername, address, profilePicUrl, accountType } = req.body || {};

    if (accountType !== undefined) {
      const validTiers = ['personal', 'business', 'agency', 'creator'];
      if (validTiers.includes(accountType)) {
        user.accountType = accountType;
      }
    }
    const str = (v) => String(v ?? '').trim();
    if (profilePicUrl !== undefined) user.profilePicUrl = str(profilePicUrl);
    if (firstName !== undefined) user.firstName = str(firstName);
    if (lastName !== undefined) user.lastName = str(lastName);
    if (mobileNumber !== undefined) user.mobileNumber = str(mobileNumber);
    if (whatsappNumber !== undefined) user.whatsappNumber = str(whatsappNumber);
    if (instagramUsername !== undefined) user.instagramUsername = str(instagramUsername).replace(/^@/, '');
    if (typeof address === 'string') {
      // The profile page edits the address as one line; keep it whole in street so it reads back unchanged
      user.address = { street: address.trim().slice(0, 300), city: '', state: '', country: '', postalCode: '' };
    } else if (address && typeof address === 'object') {
      user.address = {
        // A field that was sent (even empty) replaces the old value, so cleared fields stay cleared
        street: str(address.street ?? user.address?.street).slice(0, 300),
        city: str(address.city ?? user.address?.city).slice(0, 120),
        state: str(address.state ?? user.address?.state).slice(0, 120),
        country: str(address.country ?? user.address?.country).slice(0, 120),
        postalCode: str(address.postalCode ?? user.address?.postalCode).slice(0, 20),
      };
    }

    await user.save();
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
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
    return serverError(res, 'Profile update error', err, 'Failed to update profile.');
  }
});

/**
 * POST /api/auth/change-password (Protected)
 * { currentPassword, newPassword }: the signed-in user changes their own password.
 */
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required.' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    if (req.impersonatedBy) {
      return res.status(403).json({ error: 'Passwords cannot be changed while viewing another workspace.' });
    }
    const user = req.user;
    // Same wrong-password lock as sign-in, so a stolen session cannot guess the password
    const lockKey = `pw:${user._id}`;
    const lock = passwordLockout.status(lockKey, clientIp(req));
    if (lock.locked) return lockedResponse(res, lock);
    const after = passwordLockout.recordFailure(lockKey, clientIp(req));
    if (!(await user.comparePassword(String(currentPassword)))) {
      if (after.locked) return lockedResponse(res, after);
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    passwordLockout.recordSuccess(lockKey, clientIp(req));
    if (await user.comparePassword(String(newPassword))) {
      return res.status(400).json({ error: 'New password must be different from the current one.' });
    }
    user.passwordHash = await User.hashPassword(String(newPassword));
    authService.bumpTokenVersion(user); // other devices are signed out
    await user.save();
    // Fresh token for this device: older tokens no longer work
    res.json({ success: true, message: 'Password changed.', token: authService.generateToken(user) });
  } catch (err) {
    console.error('❌ Change password error:', err.message);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

/**
 * PUT /api/auth/passkeys/:credentialId (Protected)
 * Renames a registered passkey
 */
router.put('/passkeys/:credentialId', requireAuth, ownerSessionOnly, async (req, res) => {
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
    return serverError(res, 'Auth route error', err);
  }
});

/**
 * DELETE /api/auth/passkeys/:credentialId (Protected)
 * Removes a registered passkey
 */
router.delete('/passkeys/:credentialId', requireAuth, ownerSessionOnly, async (req, res) => {
  try {
    const { credentialId } = req.params;
    req.user.passkeys = (req.user.passkeys || []).filter(p => p.credentialId !== credentialId);
    await req.user.save();
    res.json({ success: true, message: 'Passkey deleted' });
  } catch (err) {
    return serverError(res, 'Auth route error', err);
  }
});

/**
 * GET /api/auth/instagram/check-handle
 * Public endpoint to live check if an Instagram handle exists, fetching profile picture, display name, and permanent IG ID
 */
router.get('/instagram/check-handle', handleIpLimit, async (req, res) => {
  try {
    const rawHandle = asString(req.query.handle) || '';
    const handle = rawHandle.replace(/^@/, '').toLowerCase();
    if (!handle || handle.length < 2) {
      return res.status(400).json({ error: 'Please enter a valid Instagram handle.' });
    }
    if (!/^[a-z0-9._]{1,30}$/.test(handle)) {
      return res.json({
        exists: false,
        handle,
        message: 'Invalid Instagram handle format. Must be 1-30 characters containing only letters, numbers, periods, and underscores.'
      });
    }

    // 1. Is this handle already a registered workspace? Only the User collection is checked:
    // other workspaces' contacts (UserMemory / SocialGraph) are private and never read here.
    const escapeRegex = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const existingUser = await User.exists({
      instagramUsername: new RegExp(`^@?${escapeRegex(handle)}$`, 'i'),
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

    // 2. Public Instagram profile preview (public page only; nothing is stored)
    let liveProfile = null;
    try {
      const targetUrl = `https://www.instagram.com/${encodeURIComponent(handle)}/`;
      const response = await axios.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 9000,
        maxContentLength: 5 * 1024 * 1024,
        maxRedirects: 3,
        validateStatus: () => true
      });

      const html = typeof response.data === 'string' ? response.data : '';
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1] || '';
      const desc = html.match(/meta content=\"([^\"]+)\" name=\"description\"/)?.[1] ||
                   html.match(/meta property=\"og:description\" content=\"([^\"]+)\"/)?.[1] || '';
      let ogImg = html.match(/meta property=\"og:image\" content=\"([^\"]+)\"/)?.[1] || '';
      if (ogImg) {
        ogImg = ogImg.replace(/&amp;/g, '&');
        if (!/^https:\/\//i.test(ogImg)) ogImg = '';
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
          fullName: (fullName || handle).slice(0, 100),
          profilePicUrl: ogImg || '',
          instagramId,
          bio: decodeHtmlEntities(desc).slice(0, 500),
          verified: html.includes('"is_verified":true') || html.includes('Verified')
        };
      }
    } catch (scrapeErr) {
      console.warn(`Instagram live check note for @${handle}:`, scrapeErr.message);
    }

    if (liveProfile) {
      return res.json({
        exists: true,
        handle,
        fullName: liveProfile.fullName || handle,
        profilePicUrl: liveProfile.profilePicUrl,
        instagramId: liveProfile.instagramId,
        bio: liveProfile.bio,
        verified: Boolean(liveProfile.verified),
        isProfessional: true,
        fromPeopleDirectory: false
      });
    }

    // 3. Instagram often blocks cloud IPs: a well-formed handle is still accepted
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
  } catch (err) {
    return serverError(res, 'Check handle error', err, 'Failed to verify Instagram handle.');
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
      const hasToken = Boolean(u.instagramPageAccessToken || u.instagram?.accessTokenEncrypted);
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
        isBanned: Boolean(u.isBanned),
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
    return serverError(res, 'Superadmin accounts error', err, 'Failed to fetch admin accounts.');
  }
});

/**
 * POST /api/auth/ig-request-access
 * User requests permission to connect Instagram in Meta Test Mode
 */
router.get('/ig-request-access', requireAuth, async (req, res) => {
  return res.json({
    igApprovalStatus: req.user.igApprovalStatus || (hasIgToken(req.user) ? 'approved' : 'none'),
    instagramUsername: req.user.instagramUsername || '',
  });
});

router.post('/ig-request-access', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const instagramUsername = asString(req.body?.instagramUsername);
    if (instagramUsername === null) return res.status(400).json({ error: 'instagramUsername must be text.' });

    if (instagramUsername) {
      user.instagramUsername = instagramUsername.replace(/^@/, '');
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
    return serverError(res, 'Request IG Access error', err, 'Failed to submit request.');
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
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: 'Target userId is required.' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (typeof instagramUsername === 'string' && instagramUsername.trim()) {
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
        igApprovalStatus: 'approved',
        instagramUsername: targetUser.instagramUsername,
      }
    });
  } catch (err) {
    return serverError(res, 'Admin approve IG access error', err, 'Failed to approve access.');
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
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: 'Target userId is required.' });
    }
    if (req.impersonatedBy) {
      return res.status(403).json({ error: 'Return to your own workspace before switching again.' });
    }
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User account not found.' });
    }
    if (targetUser.role === 'superadmin' && targetUser._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Superadmin workspaces cannot be impersonated.' });
    }
    if (targetUser.isBanned) {
      return res.status(403).json({ error: 'This account is suspended.' });
    }

    const isSelf = targetUser._id.toString() === req.user._id.toString();
    const token = authService.generateToken(targetUser, isSelf ? {} : { impersonatedBy: req.user });
    if (!isSelf) {
      console.warn(`🕵️ [Impersonation] ${req.user.email} (${req.user._id}) entered workspace ${targetUser.email} (${targetUser._id}) from ${req.ip} at ${new Date().toISOString()}`);
    }
    res.json({
      success: true,
      token,
      // Same fields as every sign-in, so a connected workspace never shows the Connect Instagram screen
      user: { ...sessionUser(targetUser), accountType: targetUser.accountType || 'personal' },
    });
  } catch (err) {
    return serverError(res, 'Impersonation error', err, 'Failed to switch workspace.');
  }
});

/**
 * DELETE /api/admin/accounts/:userId
 * Superadmin can permanently delete any user workspace / account
 */
/**
 * GET /api/admin/tokens (Superadmin)
 * Token Health Radar: expiry and health of every tenant's Instagram token (values are never returned)
 */
router.get('/admin/tokens', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied: Superadmin privileges required.' });
    }
    const tokenHealthService = require('../services/tokenHealthService');
    res.json({ success: true, tokens: await tokenHealthService.listTokenHealth() });
  } catch (err) {
    console.error('Token radar error:', err.message);
    res.status(500).json({ error: 'Failed to load token health' });
  }
});

/**
 * POST /api/admin/tokens/:userId/refresh (Superadmin)
 * Force an immediate refresh / re-check of one tenant's token
 */
router.post('/admin/tokens/:userId/refresh', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied: Superadmin privileges required.' });
    }
    const target = await User.findById(req.params.userId);
    if (!target) return res.status(404).json({ error: 'Account not found.' });
    const tokenHealthService = require('../services/tokenHealthService');
    const result = await tokenHealthService.refreshUserToken(target);
    res.status(result.error ? 502 : 200).json({ success: !result.error, ...result });
  } catch (err) {
    console.error('Token refresh error:', err.message);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

/**
 * POST /api/admin/accounts/:userId/ban (Superadmin)
 * Emergency killswitch: { banned: true } suspends the tenant and revokes its Instagram token;
 * { banned: false } lifts the suspension (the creator must reconnect Instagram)
 */
router.post('/admin/accounts/:userId/ban', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied: Superadmin privileges required.' });
    }
    if (req.user._id.toString() === req.params.userId) {
      return res.status(400).json({ error: 'Cannot ban your own superadmin account.' });
    }
    const target = await User.findById(req.params.userId);
    if (!target) return res.status(404).json({ error: 'Account not found.' });

    const banned = req.body?.banned !== false;
    if (banned) {
      const token = getUserInstagramToken(target);
      const pageId = target.instagram?.pageId;
      if (token && pageId) {
        try {
          await axios.delete(`https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`, { params: { access_token: token } });
        } catch (unsubErr) {
          console.warn(`⚠️ Killswitch could not unsubscribe Page ${pageId}:`, unsubErr.response?.data?.error?.message || unsubErr.message);
        }
      }
      clearUserInstagram(target);
      const PersonaConfig = require('../models/PersonaConfig');
      await PersonaConfig.updateMany({ ownerId: target._id }, { $set: { instagramPageAccessToken: '', globalBotActive: false } });
      await redisService.invalidatePersonaConfig();
    }
    target.isBanned = banned;
    target.bannedAt = banned ? new Date() : null;
    authService.bumpTokenVersion(target); // end every session of this account
    await target.save();

    const handle = target.instagramUsername || target.username;
    res.json({ success: true, isBanned: banned, message: banned ? `@${handle} suspended and Instagram token revoked.` : `@${handle} reinstated.` });
  } catch (err) {
    console.error('Ban account error:', err.message);
    res.status(500).json({ error: 'Failed to update account status' });
  }
});

/**
 * POST /api/admin/accounts/:userId/role (Superadmin)
 * { role: 'superadmin' | 'user' } grants or removes superadmin rights.
 * You cannot change your own role, and the last superadmin can never be removed.
 */
router.post('/admin/accounts/:userId/role', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied: Superadmin privileges required.' });
    }
    const role = req.body?.role;
    if (!['superadmin', 'user'].includes(role)) {
      return res.status(400).json({ error: "Role must be 'superadmin' or 'user'." });
    }
    if (req.user._id.toString() === req.params.userId) {
      return res.status(400).json({ error: 'You cannot change your own role.' });
    }
    const target = await User.findById(req.params.userId);
    if (!target) return res.status(404).json({ error: 'Account not found.' });
    if (role === 'superadmin' && target.isBanned) {
      return res.status(400).json({ error: 'Lift the suspension before making this account a superadmin.' });
    }
    if (role === 'user' && target.role === 'superadmin') {
      const supers = await User.countDocuments({ role: 'superadmin' });
      if (supers <= 1) return res.status(400).json({ error: 'At least one superadmin must remain.' });
    }
    if (target.role !== role) authService.bumpTokenVersion(target);
    target.role = role;
    await target.save();
    const handle = target.instagramUsername || target.username;
    res.json({
      success: true,
      role,
      message: role === 'superadmin' ? `@${handle} is now a superadmin.` : `@${handle} is no longer a superadmin.`,
    });
  } catch (err) {
    console.error('Change role error:', err.message);
    res.status(500).json({ error: 'Failed to change role' });
  }
});

router.delete('/admin/accounts/:userId', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied: Superadmin privileges required.' });
    }
    const { userId } = req.params;
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: 'Target userId is required.' });
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
    const ownerId = targetUser._id;

    const Message = require('../models/Message');
    const UserMemory = require('../models/UserMemory');
    const Lead = require('../models/Lead');
    const Booking = require('../models/Booking');
    const PersonaConfig = require('../models/PersonaConfig');
    const KnowledgeDoc = require('../models/KnowledgeDoc');
    const Storyboard = require('../models/Storyboard');
    const WorkspaceFeatures = require('../models/WorkspaceFeatures');
    const MediaVault = require('../models/MediaVault');
    const SocialGraph = require('../models/SocialGraph');

    // Uploaded files recorded for this workspace (only names directly inside public/uploads)
    const path = require('path');
    const fs = require('fs');
    const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
    const [mediaItems, docs] = await Promise.all([
      MediaVault.find({ ownerId }).select('url').lean(),
      KnowledgeDoc.find({ ownerId, sourceType: { $ne: 'link' } }).select('fileUrl').lean(),
    ]);
    const knowledgeDir = path.join(__dirname, '..', 'storage', 'knowledge');
    const candidateFiles = new Map(); // absolute path -> basename
    for (const url of [...mediaItems.map((m) => m.url), ...docs.map((d) => d.fileUrl)]) {
      const filePath = resolveUploadPath(url, uploadsDir)
        // Private documents live in storage/knowledge behind /api/knowledge/files/<name>
        || resolveUploadPath(String(url || '').replace('/api/knowledge/files/', '/uploads/'), knowledgeDir);
      if (filePath) candidateFiles.set(filePath, path.basename(filePath));
    }

    // Delete the account and everything it owns
    const ownedModels = { Message, UserMemory, Lead, Booking, PersonaConfig, KnowledgeDoc, Storyboard, WorkspaceFeatures, MediaVault, SocialGraph };
    const cleanup = {};
    for (const [name, Model] of Object.entries(ownedModels)) {
      try {
        const result = await Model.deleteMany({ ownerId });
        cleanup[name] = result?.deletedCount || 0;
      } catch (e) {
        console.warn(`${name} cleanup warning:`, e.message);
        cleanup[name] = 'failed';
      }
    }
    await User.findByIdAndDelete(ownerId);

    // Remove files from disk unless another workspace still references the same file
    let filesDeleted = 0;
    const escapeRegex = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    for (const [filePath, name] of candidateFiles) {
      try {
        const pattern = new RegExp(`/uploads/${escapeRegex(name)}(?:[?#]|$)`);
        const stillUsed = await MediaVault.exists({ url: pattern }) || await KnowledgeDoc.exists({ fileUrl: pattern });
        if (stillUsed) continue;
        await fs.promises.unlink(filePath);
        filesDeleted += 1;
      } catch (e) {
        if (e.code !== 'ENOENT') console.warn('Upload cleanup warning:', e.message);
      }
    }
    try { await redisService.invalidatePersonaConfig(); } catch { /* cache only */ }
    console.warn(`🗑️ [Admin] ${req.user.email} deleted account ${targetEmail} (${ownerId}):`, JSON.stringify({ ...cleanup, filesDeleted }));

    res.json({
      success: true,
      message: `Account @${targetHandle} (${targetEmail}) was permanently deleted.`
    });
  } catch (err) {
    return serverError(res, 'Superadmin delete account error', err, 'Failed to delete account.');
  }
});

module.exports = {
  router,
  requireAuth,
};
