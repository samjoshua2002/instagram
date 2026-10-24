const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const User = require('../models/User');
const authService = require('../services/authService');
const redisService = require('../services/redisService');
const { setUserInstagram, getUserInstagramToken, clearUserInstagram } = require('../services/instagramTokenService');

const OAUTH_STATE_TTL_SECONDS = 600;

// Serializes a value so it is safe to embed inside an inline <script>
const jsValue = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

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
    if (user.isBanned) {
      return res.status(403).json({ error: 'This account has been suspended. Please contact support.' });
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
router.post('/register/request-otp', async (req, res) => {
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
    } = req.body;

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

    if (existing && existing.isVerified !== false) {
      if (existing.email === cleanEmail) {
        return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
      }
      return res.status(409).json({ error: 'This username is already taken. Please choose another.' });
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
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
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
      return res.status(500).json({ error: 'Failed to send verification email: ' + mailErr.message });
    }
  } catch (err) {
    console.error('❌ Registration Request OTP error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/register/resend-otp
 * Resend OTP to email address for pending unverified accounts
 */
router.post('/register/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ error: 'No account found with this email.' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.verificationOtp = {
      code: otpCode,
      expiresAt: otpExpires,
    };
    await user.save();

    try {
      const sendResult = await authService.sendOtpEmail(cleanEmail, otpCode, 'Account Verification');
      const targetMsg = sendResult.forwarded
        ? `A fresh 6-digit verification code was sent to ${sendResult.deliveredTo} (Resend sandbox for ${cleanEmail}).`
        : `A fresh 6-digit verification code has been sent to ${cleanEmail}. Please check your inbox.`;
      res.json({
        success: true,
        message: targetMsg,
        email: cleanEmail,
      });
    } catch (mailErr) {
      console.error('❌ [Resend OTP] Email sending failed:', mailErr.message);
      return res.status(500).json({ error: 'Failed to resend verification email: ' + mailErr.message });
    }

    res.json({
      success: true,
      message: `A fresh 6-digit verification code has been sent to ${cleanEmail}. Please check your inbox.`,
      email: cleanEmail,
    });
  } catch (err) {
    console.error('❌ Resend OTP error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/register/verify-otp
 * Step 1.5: Confirm OTP, mark account as verified, and return authenticated session
 */
router.post('/register/verify-otp', async (req, res) => {
  try {
    const { email, otpCode } = req.body;
    if (!email || !otpCode) {
      return res.status(400).json({ error: 'Email and 6-digit verification code are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (!user || !user.verificationOtp?.code) {
      return res.status(400).json({ error: 'No pending verification request found for this email.' });
    }

    if (new Date() > new Date(user.verificationOtp.expiresAt)) {
      return res.status(400).json({ error: 'Verification code expired. Please request a new code.' });
    }

    if (user.verificationOtp.code !== otpCode.trim()) {
      return res.status(400).json({ error: 'Invalid 6-digit verification code.' });
    }

    user.isVerified = true;
    user.verificationOtp = { code: '', expiresAt: null };
    user.lastLogin = new Date();
    await user.save();

    const token = authService.generateToken(user);
    const isSuper = user.role === 'superadmin';

    res.json({
      success: true,
      token,
      message: 'Account verified successfully!',
      user: {
        id: user._id,
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
        profilePicUrl: user.profilePicUrl,
        hasPasskeys: (user.passkeys || []).length > 0,
        hasInstagramToken: Boolean(user.instagramPageAccessToken),
        isInstagramConnected: Boolean(user.instagramPageAccessToken),
      },
    });
  } catch (err) {
    console.error('❌ Registration Verify OTP error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/login
 * Standard login: Direct password verification.
 * (OneAuth / TOTP is an alternative login method, NOT enforced on password login)
 */
router.post('/login', async (req, res) => {
  try {
    const { identifier, password, totpCode } = req.body;
    if (!identifier) {
      return res.status(400).json({ error: 'Email or Username is required' });
    }

    // If totpCode is provided without password, route to OneAuth passwordless login
    if (!password && totpCode) {
      return handleOneAuthDirectLogin(req, res, identifier, totpCode);
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
    if (user.isBanned) {
      return res.status(403).json({ error: 'This account has been suspended. Please contact support.' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = authService.generateToken(user);
    const isSuper = user.role === 'superadmin';

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
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
      },
    });
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Helper to execute direct Zoho OneAuth login
 */
async function handleOneAuthDirectLogin(req, res, identifier, code) {
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

  user.lastLogin = new Date();
  await user.save();

  const token = authService.generateToken(user);
  return res.json({
    success: true,
    token,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      mobileNumber: user.mobileNumber,
      whatsappNumber: user.whatsappNumber,
      instagramUsername: user.instagramUsername,
      accountType: user.accountType,
      hasPasskeys: (user.passkeys || []).length > 0,
    },
  });
}

/**
 * POST /api/auth/oneauth-login
 * Dedicated direct passwordless login using Zoho OneAuth 6-digit code
 */
router.post('/oneauth-login', async (req, res) => {
  try {
    const { identifier, code } = req.body;
    if (!identifier || !code) {
      return res.status(400).json({ error: 'Email/Username and 6-digit OneAuth code are required' });
    }
    return handleOneAuthDirectLogin(req, res, identifier, code);
  } catch (err) {
    console.error('❌ OneAuth login error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/oneauth/request-setup-otp
 * Allows unauthenticated owner to verify identity via email OTP to retrieve Zoho OneAuth QR code
 */
router.post('/oneauth/request-setup-otp', async (req, res) => {
  try {
    const { email = 'guidetalk.app@gmail.com' } = req.body;
    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetOtp = {
      code: otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };
    await user.save();

    await authService.sendOtpEmail(user.email, otpCode, 'Zoho OneAuth Setup');
    res.json({ success: true, message: `A 6-digit verification code has been sent to ${user.email} to unlock OneAuth setup.` });
  } catch (err) {
    console.error('❌ Request OneAuth Setup OTP error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/oneauth/verify-setup-otp
 * Verifies email OTP and returns the QR code & secret to link Zoho OneAuth app
 */
router.post('/oneauth/verify-setup-otp', async (req, res) => {
  try {
    const { email = 'guidetalk.app@gmail.com', otpCode } = req.body;
    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (!user || !user.resetOtp?.code) {
      return res.status(400).json({ error: 'Invalid or expired setup request' });
    }

    if (new Date() > new Date(user.resetOtp.expiresAt)) {
      return res.status(400).json({ error: 'Verification code expired. Please request a new one.' });
    }

    if (user.resetOtp.code !== (otpCode || '').trim()) {
      return res.status(400).json({ error: 'Invalid 6-digit verification code' });
    }

    // Reset OTP code
    user.resetOtp = { code: '', expiresAt: null };
    await user.save();

    // Return QR code and secret
    const totpData = await authService.getTotpQrCode(user);
    res.json({
      success: true,
      ...totpData,
    });
  } catch (err) {
    console.error('❌ Verify OneAuth Setup OTP error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
;

/**
 * GET /api/auth/oneauth/qr
 * Direct QR Code retrieval for easy phone scanning on the login screen
 */
router.get('/oneauth/qr', async (req, res) => {
  try {
    const rawEmail = (req.query.email || '').trim().toLowerCase();
    let user = null;
    if (rawEmail) {
      user = await User.findOne({
        $or: [{ email: rawEmail }, { username: rawEmail }]
      });
    }
    // If no email specified, fallback to owner account
    if (!user && !rawEmail) {
      user = await User.findOne({
        $or: [{ email: 'samjoshuacs2002@gmail.com' }, { username: 'samjoshua2002' }]
      });
    }
    if (!user) {
      return res.status(404).json({ error: `Account for "${rawEmail}" was not found. Please verify your email or username.` });
    }

    if (!user.twoFactor?.secret) {
      const { generateSecret } = require('otplib');
      user.twoFactor = user.twoFactor || {};
      user.twoFactor.secret = generateSecret();
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
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/forgot-password/verify-oneauth
 * Reset password instantly using Zoho OneAuth code (bypasses email timeouts completely)
 */
router.post('/forgot-password/verify-oneauth', async (req, res) => {
  try {
    const { identifier = 'guidetalk.app@gmail.com', totpCode, newPassword } = req.body;
    if (!identifier || !totpCode || !newPassword) {
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
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/forgot-password/send-otp
 * Generates and sends a 6-digit OTP code to Sam's email
 */
router.post('/forgot-password/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.json({ success: true, message: 'If this email exists, a verification code has been sent.' });
    }

    // Generate secure 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetOtp = {
      code: otpCode,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    };
    await user.save();

    // Send verification email
    try {
      const sendResult = await authService.sendOtpEmail(user.email, otpCode, 'Password Reset');
      const targetMsg = sendResult.forwarded
        ? `A 6-digit verification code was sent to ${sendResult.deliveredTo} (Resend sandbox for ${user.email}).`
        : `A 6-digit verification code has been sent to ${user.email}. Please check your inbox.`;
      res.json({
        success: true,
        message: targetMsg
      });
    } catch (mailErr) {
      console.error('❌ [Password Reset OTP] Email delivery failed:', mailErr.message);
      return res.status(500).json({ error: 'Failed to send verification email: ' + mailErr.message });
    }
  } catch (err) {
    console.error('❌ Send OTP error:', err.message);
    res.status(500).json({ error: err.message || 'Error generating password reset code' });
  }
});

/**
 * POST /api/auth/forgot-password/verify-reset
 * Verifies OTP and updates user password
 */
router.post('/forgot-password/verify-reset', async (req, res) => {
  try {
    const { email, otpCode, newPassword } = req.body;
    if (!email || !otpCode || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP code, and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });
    if (!user || !user.resetOtp?.code) {
      return res.status(400).json({ error: 'Invalid or expired verification request' });
    }

    if (new Date() > new Date(user.resetOtp.expiresAt)) {
      return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    if (user.resetOtp.code !== otpCode.trim()) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    user.passwordHash = await User.hashPassword(newPassword);
    user.resetOtp = { code: '', expiresAt: null };
    await user.save();

    res.json({ success: true, message: 'Password reset successfully! You can now log in.' });
  } catch (err) {
    console.error('❌ Verify Reset error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth/passkey/login-options
 * Generates WebAuthn options for Passkey / Fingerprint login
 */
router.get('/passkey/login-options', async (req, res) => {
  try {
    const rawId = (req.query.email || req.query.identifier || '').trim().toLowerCase();
    let user = null;
    if (rawId) {
      user = await User.findOne({
        $or: [{ email: rawId }, { username: rawId }]
      });
    }
    const options = await authService.generatePasskeyAuthenticationOptions(user, req);
    res.json(options);
  } catch (err) {
    console.error('❌ Passkey login options error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/passkey/login-verify
 * Verifies biometric assertion and logs user in
 */
router.post('/passkey/login-verify', async (req, res) => {
  try {
    const { response, email, identifier } = req.body;
    if (!response) return res.status(400).json({ error: 'Assertion response is required' });

    let user = null;
    const cleanId = (email || identifier || '').trim().toLowerCase();
    if (cleanId) {
      user = await User.findOne({
        $or: [{ email: cleanId }, { username: cleanId }]
      });
    }
    if (!user && response.id) {
      user = await User.findOne({ 'passkeys.credentialId': response.id });
    }
    if (!user) {
      user = await User.findOne({ email: 'samjoshuacs2002@gmail.com' });
    }
    if (!user) {
      return res.status(404).json({ error: 'No user registered with this passkey' });
    }

    const verified = await authService.verifyPasskeyAuthentication(user, response, req);
    if (!verified) {
      return res.status(401).json({ error: 'Passkey verification failed' });
    }

    const token = authService.generateToken(user);
    const isSuper = user.role === 'superadmin';

    res.json({
      success: true,
      token,
      user: {
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
    res.status(500).json({ error: err.message });
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
    const { response, name } = req.body;
    if (!response) return res.status(400).json({ error: 'Registration response required' });

    const verified = await authService.verifyPasskeyRegistration(req.user, response, req);
    if (!verified) {
      return res.status(400).json({ error: 'Failed to verify passkey registration' });
    }

    // Set device name from client or detect dynamically from User-Agent
    const userAgent = req.get('user-agent') || '';
    let resolvedName = (name || '').trim();
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
    } = req.body;

    if (accountType) {
      user.accountType = accountType;
    }
    if (instagramUsername) {
      user.instagramUsername = instagramUsername.trim().replace(/^@/, '');
    }
    // Store pasted tokens encrypted; a blank field means "unchanged"
    if (instagramPageAccessToken && instagramPageAccessToken.trim()) {
      setUserInstagram(user, { token: instagramPageAccessToken.trim(), accountId: (instagramAccountId || '').trim() });
    }
    if (instagramAccountId !== undefined) {
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
      let persona = await PersonaConfig.findOne();
      if (!persona) {
        persona = new PersonaConfig();
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

    // Sync with RoutingConfig
    try {
      const RoutingConfig = require('../models/RoutingConfig');
      let routing = await RoutingConfig.findOne();
      if (!routing) {
        routing = new RoutingConfig();
      }
      if (chatMode) {
        routing.chatMode = chatMode;
      }
      if (typeof enableGlobalBot === 'boolean') {
        routing.globalBotActive = enableGlobalBot;
      }
      await routing.save();
    } catch (e) {
      console.warn('Could not update routing during onboarding:', e.message);
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
        hasInstagramToken: Boolean(user.instagramPageAccessToken),
      }
    });
  } catch (err) {
    console.error('❌ Onboarding error:', err.message);
    res.status(500).json({ error: 'Failed to complete onboarding: ' + err.message });
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
    console.error('❌ Skip onboarding error:', err.message);
    res.status(500).json({ error: 'Failed to skip onboarding: ' + err.message });
  }
});

/**
 * GET /api/auth/instagram/connect
 * Redirects to Meta OAuth login dialog for in-app Instagram connection
 */
router.get('/instagram/connect', async (req, res) => {
  try {
    const metaAppId = process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID || '28946827981672606';
    const clientOrigin = req.query.origin || 'https://instagram-ebon-zeta.vercel.app';

    // The popup cannot send an Authorization header, so the session JWT arrives as ?token= and is checked here
    let userId = null;
    if (req.query.token) {
      const decoded = authService.verifyToken(req.query.token);
      if (!decoded || !decoded.userId) {
        return res.status(401).send('Your session has expired. Please log in again and retry.');
      }
      userId = decoded.userId;
    }

    let backendUrl = process.env.BACKEND_URL || (req.headers.host ? `https://${req.headers.host}` : 'https://instagram-ai-bot-64tf.onrender.com');
    backendUrl = backendUrl.replace(/\/+$/, '').replace(/^http:\/\/(.*onrender\.com)/i, 'https://$1');
    const redirectUri = `${backendUrl}/api/auth/instagram/callback`;

    // Opaque single-use state; the session data stays server-side
    const state = crypto.randomBytes(32).toString('hex');
    await redisService.set(`oauth_state:${state}`, {
      userId,
      origin: clientOrigin,
      redirectUri,
      appId: metaAppId,
    }, OAUTH_STATE_TTL_SECONDS);

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
    res.status(500).send('Failed to initiate Instagram OAuth: ' + err.message);
  }
});

/**
 * GET /api/auth/instagram/callback
 * Exchanges Meta / Instagram OAuth code for Page Access Token & Instagram Business ID
 */
router.get('/instagram/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    let origin = 'https://instagram-ebon-zeta.vercel.app';
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
    if (savedState.origin) origin = savedState.origin;
    if (savedState.userId) stateUserId = savedState.userId;
    if (savedState.redirectUri) savedRedirectUri = savedState.redirectUri;
    if (savedState.appId) savedAppId = savedState.appId;

    if (error) {
      console.error('❌ Meta OAuth error:', error, error_description);
      const safeErr = (error_description || error || 'Authorization was cancelled').replace(/['"]/g, '');
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Authorization Failed</title></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fafafa; color: #09090b;">
          <div style="background: #ffffff; border: 1px solid #fee2e2; border-radius: 16px; padding: 36px 30px; max-width: 420px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.06);">
            <div style="display: inline-block; background: #fee2e2; color: #b91c1c; font-weight: 700; font-size: 12px; padding: 4px 10px; border-radius: 999px; margin-bottom: 12px;">AUTHORIZATION FAILED</div>
            <h2 style="margin: 0 0 8px 0; font-size: 20px;">Could Not Connect</h2>
            <p style="color: #71717a; font-size: 14px; line-height: 1.5; margin: 0 0 16px 0;">${safeErr}</p>
            <p style="font-size: 12px; color: #a1a1aa;">Closing window and returning to Chatter OS...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'INSTAGRAM_OAUTH_ERROR', error: "${safeErr}" }, ${jsValue(origin)});
              setTimeout(() => { window.close(); }, 3000);
            }
          </script>
        </body>
        </html>
      `);
    }

    if (!code) {
      return res.status(400).send('No authorization code provided by Meta.');
    }

    // Strip URL fragment #_ from code
    const cleanCode = (code || '').split('#')[0].trim();
    const instagramAppId = savedAppId || process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID || '28946827981672606';
    const metaAppId = process.env.META_APP_ID || '28946827981672606';
    const metaAppSecret = process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET || '4494347ba6f01696552b99a2e90ccd75';

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

    // Candidate App IDs (prioritize active configured App 28946827981672606)
    const appIdCandidates = Array.from(new Set([
      '28946827981672606',
      metaAppId,
      instagramAppId,
      '1082976137966604'
    ])).filter(Boolean);

    let shortLivedToken = '';
    let instagramAccountId = '';
    let instagramUsername = '';
    let facebookPageId = '';
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
            facebookPageId = page.id;
            instagramAccountId = page.instagram_business_account.id;
            instagramUsername = page.instagram_business_account.username;
            console.log(`✅ [Meta OAuth] Linked via Instagram Business Account: @${instagramUsername} (${instagramAccountId})`);
            break;
          }
        }
        if (!instagramAccountId && pages.length > 0) {
          const firstPage = pages[0];
          longLivedToken = firstPage.access_token || longLivedToken;
          facebookPageId = firstPage.id;
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
            await PersonaConfig.findOneAndUpdate(
              { ownerId: user._id },
              {
                $set: {
                  ownerId: user._id,
                  instagramPageAccessToken: encrypted ? '' : linkedPageToken,
                  instagramAccountId: instagramAccountId,
                  ...(instagramUsername ? { instagramHandle: `@${instagramUsername.replace(/^@/, '')}` } : {}),
                  globalBotActive: true
                }
              },
              { upsert: true, new: true }
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
          <p>Connected as <strong>@${instagramUsername || 'Instagram'}</strong>.<br/>Returning to Chatter OS...</p>
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
    const errText = (err.response?.data?.error?.message || err.message || 'Unknown error').replace(/['"]/g, '');
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Connection Failed</title></head>
      <body style="font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fafafa;">
        <div style="background: #ffffff; border: 1px solid #fee2e2; border-radius: 16px; padding: 36px 30px; max-width: 440px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.06);">
          <div style="display: inline-block; background: #fee2e2; color: #b91c1c; font-weight: 700; font-size: 12px; padding: 4px 10px; border-radius: 999px; margin-bottom: 12px;">CONNECTION FAILED</div>
          <h2 style="margin: 0 0 8px 0; font-size: 18px; color: #dc2626;">Could Not Retrieve Token</h2>
          <p style="color: #4b5563; font-size: 13px; line-height: 1.5; margin: 0 0 16px 0;">${errText}</p>
          <p style="font-size: 12px; color: #9ca3af;">You can also enter your Page Access Token manually in the setup wizard.</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'INSTAGRAM_OAUTH_ERROR', error: "${errText}" }, "*");
            setTimeout(() => { window.close(); }, 3500);
          }
        </script>
      </body>
      </html>
    `);
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
    const { firstName, lastName, mobileNumber, whatsappNumber, instagramUsername, address, profilePicUrl } = req.body;

    if (profilePicUrl !== undefined) user.profilePicUrl = profilePicUrl;
    if (firstName !== undefined) user.firstName = firstName.trim();
    if (lastName !== undefined) user.lastName = lastName.trim();
    if (mobileNumber !== undefined) user.mobileNumber = mobileNumber.trim();
    if (whatsappNumber !== undefined) user.whatsappNumber = whatsappNumber.trim();
    if (instagramUsername !== undefined) user.instagramUsername = instagramUsername.trim();
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
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/auth/passkeys/:credentialId (Protected)
 * Renames a registered passkey
 */
router.put('/passkeys/:credentialId', requireAuth, async (req, res) => {
  try {
    const { credentialId } = req.params;
    const { name } = req.body;
    if (!name || !name.trim()) {
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
    const { instagramUsername } = req.body;

    if (instagramUsername) {
      user.instagramUsername = instagramUsername.trim().replace(/^@/, '');
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

    const { userId, instagramUsername } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Target userId is required.' });
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
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Target userId is required.' });
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
    await target.save();

    const handle = target.instagramUsername || target.username;
    res.json({ success: true, isBanned: banned, message: banned ? `@${handle} suspended and Instagram token revoked.` : `@${handle} reinstated.` });
  } catch (err) {
    console.error('Ban account error:', err.message);
    res.status(500).json({ error: 'Failed to update account status' });
  }
});

router.delete('/admin/accounts/:userId', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied: Superadmin privileges required.' });
    }
    const { userId } = req.params;
    if (!userId) {
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

    // Delete user from DB
    await User.findByIdAndDelete(userId);

    // Delete social graph / contacts associated with this user
    try {
      const SocialGraph = require('../models/SocialGraph');
      await SocialGraph.deleteMany({
        $or: [
          { ownerId: userId },
          { instagramHandle: targetUser.instagramUsername },
          { senderId: targetUser.instagramId }
        ]
      });
    } catch (e) {
      console.warn('SocialGraph cleanup warning:', e.message);
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
