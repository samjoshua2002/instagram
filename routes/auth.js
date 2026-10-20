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
      // Return success anyway to avoid user enumeration
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
    res.status(500).json({ error: err.message });
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
    const email = req.query.email || 'guidetalk.app@gmail.com';
    const user = await User.findOne({ email });
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
    const { response, email = 'guidetalk.app@gmail.com' } = req.body;
    if (!response) return res.status(400).json({ error: 'Assertion response is required' });

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.findOne({ 'passkeys.credentialId': response.id });
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
        accountType: user.accountType,
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

    // Set custom passkey device name if provided
    if (name && req.user.passkeys.length > 0) {
      req.user.passkeys[req.user.passkeys.length - 1].name = name;
      await req.user.save();
    }

    res.json({ success: true, message: 'Passkey added successfully!' });
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
 * Updates user profile details
 */
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { firstName, lastName, mobileNumber, whatsappNumber, instagramUsername, address } = req.body;

    if (firstName !== undefined) user.firstName = firstName.trim();
    if (lastName !== undefined) user.lastName = lastName.trim();
    if (mobileNumber !== undefined) user.mobileNumber = mobileNumber.trim();
    if (whatsappNumber !== undefined) user.whatsappNumber = whatsappNumber.trim();
    if (instagramUsername !== undefined) user.instagramUsername = instagramUsername.trim();
    if (address && typeof address === 'object') {
      user.address = {
        street: address.street || user.address.street,
        city: address.city || user.address.city,
        state: address.state || user.address.state,
        country: address.country || user.address.country,
        postalCode: address.postalCode || user.address.postalCode,
      };
    }

    await user.save();
    res.json({ success: true, message: 'Profile updated successfully', user });
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
