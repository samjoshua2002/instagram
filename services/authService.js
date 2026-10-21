const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const { generateSecret, verifySync } = require('otplib');
const QRCode = require('qrcode');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'chatter_jwt_secret_samjoshua_auth_2026_super_secure_key_99';
const RP_NAME = process.env.RP_NAME || 'Chatter OS';

class AuthService {
  constructor() {
    this.resend = null;
    this.initResend();
    this.transporter = null;
    this.initMailer();
  }

  initResend() {
    const key = process.env.RESEND_API_KEY;
    if (key) {
      this.resend = new Resend(key);
    }
  }

  initMailer() {
    const user = process.env.EMAIL_USER;
    const rawPass = process.env.EMAIL_PASS;
    const pass = rawPass ? rawPass.replace(/\s+/g, '') : null;
    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user, pass },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
      });
    }
  }

  /**
   * Automatically initializes Sam Joshua's primary owner account if not already created
   */
  async ensureOwnerUser() {
    try {
      const email = 'guidetalk.app@gmail.com';
      let user = await User.findOne({ email });
      if (!user) {
        user = await User.findOne({ username: 'samjoshua' });
      }

      const totpSecret = generateSecret();

      if (!user) {
        // Initial default temporary password: SamJoshua@2026!
        const initialHash = await User.hashPassword('SamJoshua@2026!');
        user = new User({
          username: 'samjoshua',
          email: 'guidetalk.app@gmail.com',
          passwordHash: initialHash,
          firstName: 'Admin',
          lastName: 'User',
          accountType: 'personal',
          twoFactor: {
            enabled: true,
            secret: totpSecret,
          },
        });
        await user.save();
        console.log(`🔐 [AuthService]: Created primary owner account for Sam Joshua (guidetalk.app@gmail.com)`);
      } else {
        // Ensure core fields are populated
        let changed = false;
        if (!user.twoFactor?.secret) {
          user.twoFactor = user.twoFactor || {};
          user.twoFactor.secret = totpSecret;
          user.twoFactor.enabled = true;
          changed = true;
        }
        if (changed) await user.save();
      }

      return user;
    } catch (err) {
      console.error('❌ [AuthService] Failed ensuring owner user:', err.message);
      return null;
    }
  }

  /**
   * Sign a JWT session token (valid for 30 days)
   */
  generateToken(user) {
    const isSuper = user.role === 'superadmin';
    return jwt.sign(
      {
        userId: user._id.toString(),
        username: user.username,
        email: user.email,
        accountType: user.accountType || 'personal',
        role: isSuper ? 'superadmin' : 'user',
        instagramId: user.instagramId || '',
        firstName: user.firstName,
        lastName: user.lastName,
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
  }

  /**
   * Verify JWT session token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return null;
    }
  }

  /**
   * Sends 6-digit OTP code using Resend (HTTPS Port 443 — reliable on Render/Cloud) with SMTP fallback
   */
  async sendOtpEmail(toEmail, otpCode, purpose = 'Password Reset') {
    const cleanTo = (toEmail || '').trim().toLowerCase();
    if (!cleanTo) throw new Error('Recipient email is required.');

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 28px 20px; background: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px; color: #09090b;">
        <div style="margin-bottom: 20px; text-align: center;">
          <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 4px; color: #09090b;">Chatter OS</h2>
          <p style="font-size: 13px; color: #71717a; margin: 0;">Identity verification</p>
        </div>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #71717a; margin-bottom: 8px;">${purpose} Code</div>
          <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #09090b; font-family: monospace;">${otpCode}</div>
          <p style="font-size: 12px; color: #71717a; margin: 8px 0 0;">Expires in 10 minutes</p>
        </div>
        <p style="font-size: 12px; color: #71717a; margin: 0; text-align: center;">
          If you didn't request this code, you can safely ignore this email.
        </p>
      </div>
    `;

    const text = `Your ${purpose} verification code is: ${otpCode}\n\nThis code expires in 10 minutes.\nIf you did not request this, you can safely ignore this email.`;
    const subject = `${otpCode} is your Chatter verification code`;

    // 1. Primary: Send via Resend HTTPS API (Port 443 — never blocked on Render)
    if (!this.resend) this.initResend();

    if (this.resend) {
      try {
        const fromAddress = process.env.RESEND_FROM || 'Chatter OS <onboarding@resend.dev>';
        const result = await this.resend.emails.send({
          from: fromAddress,
          to: [cleanTo],
          subject,
          html,
          text,
        });

        if (result.error) {
          // If Resend is in free onboarding sandbox mode, it only allows sending to the registered account (guidetalk.app@gmail.com)
          const errorMsg = result.error.message || '';
          if (result.error.statusCode === 403 && errorMsg.includes('only send testing emails')) {
            console.log(`ℹ️ [Resend Sandbox] Forwarding code for ${cleanTo} to registered Resend email guidetalk.app@gmail.com`);
            const fallbackResult = await this.resend.emails.send({
              from: fromAddress,
              to: ['guidetalk.app@gmail.com'],
              subject: `${otpCode} is your Chatter verification code (for ${cleanTo})`,
              text: `Your ${purpose} verification code for ${cleanTo} is: ${otpCode}\n\n(Delivered to guidetalk.app@gmail.com via Resend testing mode)`,
              html: html.replace('Identity verification', `Identity verification for ${cleanTo} (Delivered to Resend verified account)`),
            });

            if (fallbackResult.error) {
              throw new Error(fallbackResult.error.message || 'Resend sandbox delivery failed');
            }

            console.log(`✅ [Resend] Dispatched to guidetalk.app@gmail.com (ID: ${fallbackResult.data?.id})`);
            return {
              success: true,
              provider: 'resend',
              deliveredTo: 'guidetalk.app@gmail.com',
              forwarded: true,
              id: fallbackResult.data?.id
            };
          }

          throw new Error(result.error.message || 'Resend email sending failed');
        }

        console.log(`✅ [Resend] Verification email dispatched to ${cleanTo} (ID: ${result.data?.id})`);
        return {
          success: true,
          provider: 'resend',
          deliveredTo: cleanTo,
          forwarded: false,
          id: result.data?.id
        };
      } catch (resendErr) {
        console.warn('⚠️ [Resend Warning]:', resendErr.message);
        // Fallback to SMTP if Resend had an unexpected failure
        if (this.transporter) {
          try {
            const info = await this.transporter.sendMail({
              from: `"Chatter" <${process.env.EMAIL_USER}>`,
              to: cleanTo,
              subject,
              text,
              html,
            });
            return { success: true, provider: 'smtp', deliveredTo: cleanTo, forwarded: false, id: info.messageId };
          } catch (smtpErr) {
            console.warn('⚠️ [SMTP Fallback Warning]:', smtpErr.message);
          }
        }
        throw resendErr;
      }
    }

    // 2. Direct SMTP Fallback
    if (!this.transporter) this.initMailer();
    if (!this.transporter) {
      throw new Error('Email service is not configured. Please ensure RESEND_API_KEY or EMAIL_USER is set.');
    }

    const info = await this.transporter.sendMail({
      from: `"Chatter" <${process.env.EMAIL_USER}>`,
      to: cleanTo,
      subject,
      text,
      html,
    });
    return { success: true, provider: 'smtp', deliveredTo: cleanTo, forwarded: false, id: info.messageId };
  }

  /**
   * Generates a new Base32 TOTP secret for Zoho OneAuth
   */
  generateTotpSecret() {
    return generateSecret();
  }

  /**
   * Verify a 6-digit TOTP code from OneAuth / Authenticator app
   */
  verifyTotp(user, token) {
    if (!user.twoFactor?.secret) return false;
    const cleanToken = (token || '').toString().trim();
    if (!/^\d{6}$/.test(cleanToken)) return false;

    // Check with TOTP (support ±35s window for device clock drift)
    try {
      const result = verifySync({ token: cleanToken, secret: user.twoFactor.secret, epochTolerance: 35 });
      return !!result?.valid;
    } catch (err) {
      console.warn('⚠️ [AuthService] TOTP verify error:', err.message);
      return false;
    }
  }

  /**
   * Generate QR Code Data URL for Zoho OneAuth / Authenticator setup
   */
  async getTotpQrCode(user) {
    const secret = user.twoFactor?.secret;
    if (!secret) return null;
    const label = `${RP_NAME}:${user.email}`;
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(RP_NAME)}&digits=6&period=30`;
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
      margin: 1,
      width: 240,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
    return {
      secret,
      otpauthUrl,
      qrDataUrl,
    };
  }

  // --- WebAuthn / Passkey Methods ---

  getRpID(req) {
    const origin = req.get('origin') || req.get('referer');
    if (origin) {
      try {
        const parsed = new URL(origin);
        return parsed.hostname;
      } catch (e) {}
    }
    const host = req.get('host') || 'localhost';
    return host.split(':')[0];
  }

  getOrigin(req) {
    const origin = req.get('origin') || req.get('referer');
    if (origin) {
      try {
        const parsed = new URL(origin);
        return `${parsed.protocol}//${parsed.host}`;
      } catch (e) {}
    }
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    return `${proto}://${host}`;
  }

  async generatePasskeyRegistrationOptions(user, req) {
    const rpID = this.getRpID(req);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: new TextEncoder().encode(user._id.toString()),
      userName: user.email,
      userDisplayName: `${user.firstName || 'Sam'} ${user.lastName || 'Joshua'}`,
      attestationType: 'none',
      excludeCredentials: (user.passkeys || []).map(p => ({
        id: p.credentialId,
        transports: p.transports || ['internal'],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    user.currentChallenge = options.challenge;
    await user.save();
    return options;
  }

  async verifyPasskeyRegistration(user, response, req) {
    const expectedChallenge = user.currentChallenge;
    const expectedOrigin = this.getOrigin(req);
    const expectedRPID = this.getRpID(req);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID,
      requireUserVerification: false,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential } = verification.registrationInfo;
      const credentialIDStr = credential.id;
      const publicKeyBase64 = Buffer.from(credential.publicKey).toString('base64');

      user.passkeys.push({
        credentialId: credentialIDStr,
        publicKey: publicKeyBase64,
        counter: credential.counter,
        transports: response.response.transports || ['internal'],
        deviceType: verification.registrationInfo.credentialDeviceType || 'singleDevice',
        backedUp: verification.registrationInfo.credentialBackedUp || false,
        name: `Passkey (Added ${new Date().toLocaleDateString()})`,
        createdAt: new Date(),
      });
      user.currentChallenge = '';
      await user.save();
      return true;
    }
    return false;
  }

  async generatePasskeyAuthenticationOptions(user, req) {
    const rpID = this.getRpID(req);
    const allowCredentials = user
      ? (user.passkeys || []).map(p => ({
          id: p.credentialId,
          transports: p.transports || ['internal'],
        }))
      : undefined;

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: 'preferred',
    });

    if (user) {
      user.currentChallenge = options.challenge;
      await user.save();
    }
    return options;
  }

  async verifyPasskeyAuthentication(user, response, req) {
    const passkey = (user.passkeys || []).find(p => p.credentialId === response.id);
    if (!passkey) {
      throw new Error('Passkey not registered on this account.');
    }

    const expectedChallenge = user.currentChallenge;
    const expectedOrigin = this.getOrigin(req);
    const expectedRPID = this.getRpID(req);

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID,
      credential: {
        id: passkey.credentialId,
        publicKey: Buffer.from(passkey.publicKey, 'base64'),
        counter: passkey.counter,
        transports: passkey.transports,
      },
      requireUserVerification: false,
    });

    if (verification.verified) {
      passkey.counter = verification.authenticationInfo.newCounter;
      user.currentChallenge = '';
      user.lastLogin = new Date();
      await user.save();
      return true;
    }
    return false;
  }
}

module.exports = new AuthService();
