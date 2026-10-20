const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
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
    this.transporter = null;
    this.initMailer();
  }

  initMailer() {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
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
          firstName: 'Sam',
          lastName: 'Joshua',
          mobileNumber: '8610866413',
          whatsappNumber: '8610866413',
          instagramUsername: 'catovidz',
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
        if (!user.mobileNumber) {
          user.mobileNumber = '8610866413';
          changed = true;
        }
        if (!user.whatsappNumber) {
          user.whatsappNumber = '8610866413';
          changed = true;
        }
        if (!user.instagramUsername) {
          user.instagramUsername = 'catovidz';
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
    return jwt.sign(
      {
        userId: user._id.toString(),
        username: user.username,
        email: user.email,
        accountType: user.accountType || 'personal',
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
   * Generates a 6-digit OTP code and sends it to the user's email via Gmail SMTP
   */
  async sendOtpEmail(toEmail, otpCode, purpose = 'Password Reset') {
    if (!this.transporter) this.initMailer();
    if (!this.transporter) {
      throw new Error('Email service not configured. Please set EMAIL_USER and EMAIL_PASS in environment.');
    }

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px; color: #09090b;">
        <div style="margin-bottom: 24px; text-align: center;">
          <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 6px; letter-spacing: -0.5px;">Chatter OS // Security</h1>
          <p style="font-size: 13px; color: #71717a; margin: 0;">Authorized access code for Sam Joshua</p>
        </div>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #71717a; margin-bottom: 8px;">Your 6-Digit ${purpose} Code</div>
          <div style="font-size: 34px; font-weight: 800; letter-spacing: 6px; color: #09090b; font-family: monospace;">${otpCode}</div>
          <p style="font-size: 12px; color: #a1a1aa; margin: 8px 0 0;">Valid for 10 minutes. Never share this code with anyone.</p>
        </div>
        <p style="font-size: 13px; line-height: 1.5; color: #52525b; margin: 0 0 16px;">
          If you did not request this verification code, please ignore this email. Your account remains protected.
        </p>
        <div style="border-top: 1px solid #f4f4f5; padding-top: 16px; text-align: center; font-size: 11px; color: #a1a1aa;">
          Chatter OS Automated Security • guidetalk.app@gmail.com
        </div>
      </div>
    `;

    return this.transporter.sendMail({
      from: `"Chatter OS Security" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `[Chatter OS] Your ${purpose} Verification Code: ${otpCode}`,
      html,
    });
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
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(RP_NAME)}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${encodeURIComponent(RP_NAME)}&digits=6&period=30`;
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    return {
      secret,
      otpauthUrl,
      qrDataUrl,
    };
  }

  // --- WebAuthn / Passkey Methods ---

  getRpID(req) {
    const host = req.get('host') || 'localhost';
    // Strip port
    const hostname = host.split(':')[0];
    return hostname;
  }

  getOrigin(req) {
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
      expectedOrigin: [expectedOrigin, 'http://localhost:3000', 'https://*.vercel.app'],
      expectedRPID: [expectedRPID, 'localhost'],
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
      expectedOrigin: [expectedOrigin, 'http://localhost:3000', 'https://*.vercel.app'],
      expectedRPID: [expectedRPID, 'localhost'],
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
