const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authService = require('../services/authService');

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
        instagramUsername: (instagramUsername || '').trim() || 'catovidz',
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
      user.instagramUsername = (instagramUsername || '').trim() || user.instagramUsername;
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
    await authService.sendOtpEmail(cleanEmail, otpCode, 'Account Verification');

    res.json({
      success: true,
      message: `A 6-digit verification code was sent to ${cleanEmail}. Please enter it below.`,
      email: cleanEmail,
    });
  } catch (err) {
    console.error('❌ Registration Request OTP error:', err.message);
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
        accountType: user.accountType,
        profilePicUrl: user.profilePicUrl,
        hasPasskeys: (user.passkeys || []).length > 0,
      },
    });
  } catch (err) {
    console.error('❌ Registration Verify OTP error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/login
 * Standard login: Password verification (+ optional OneAuth 2FA if enabled)
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

    // Check if 2FA is active on this account
    if (user.twoFactor?.enabled && user.twoFactor?.secret) {
      if (!totpCode) {
        return res.json({
          requireTotp: true,
          message: 'Please enter the 6-digit verification code from your OneAuth app',
        });
      }

      const isValidTotp = authService.verifyTotp(user, totpCode);
      if (!isValidTotp) {
        return res.status(401).json({ error: 'Invalid 6-digit OneAuth verification code' });
      }
    }

    user.lastLogin = new Date();
    await user.save();

    const token = authService.generateToken(user);
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
        accountType: user.accountType,
        hasPasskeys: (user.passkeys || []).length > 0,
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
        $or: [{ email: 'guidetalk.app@gmail.com' }, { username: 'samjoshua' }]
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
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    };
    await user.save();

    await authService.sendOtpEmail(user.email, otpCode, 'Password Reset');
    res.json({ success: true, message: `A 6-digit verification code has been sent to ${user.email}` });
  } catch (err) {
    console.error('❌ Send OTP error:', err.message);
    res.status(500).json({ error: err.message || 'Email delivery failed or timed out. You can also reset password using your Zoho OneAuth app code directly!' });
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
      user = await User.findOne({ email: 'guidetalk.app@gmail.com' });
    }
    if (!user) {
      return res.status(404).json({ error: 'No user registered with this passkey' });
    }

    const verified = await authService.verifyPasskeyAuthentication(user, response, req);
    if (!verified) {
      return res.status(401).json({ error: 'Passkey verification failed' });
    }

    const token = authService.generateToken(user);
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
        accountType: user.accountType,
        hasPasskeys: (user.passkeys || []).length > 0,
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
    accountType: user.accountType,
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
    res.json({ success: true, message: 'Profile updated successfully', user });
  } catch (err) {
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

module.exports = {
  router,
  requireAuth,
};
