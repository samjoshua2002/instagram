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
        if (user.role !== 'superadmin') {
          user.role = 'superadmin';
          changed = true;
        }
        if (!user.instagramPageAccessToken && process.env.INSTAGRAM_PAGE_ACCESS_TOKEN) {
          user.instagramPageAccessToken = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
          changed = true;
        }
        if (!user.instagramAccountId && process.env.INSTAGRAM_ACCOUNT_ID) {
          user.instagramAccountId = process.env.INSTAGRAM_ACCOUNT_ID;
          changed = true;
        }
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

    // 1. Primary: Send via Brevo HTTPS REST API (Port 443 — sends from guidetalk.app@gmail.com directly to any requester)
    const brevoKey = process.env.BREVO_API_KEY;
    if (brevoKey) {
      try {
        const senderEmail = process.env.EMAIL_USER || 'guidetalk.app@gmail.com';
        const senderName = process.env.EMAIL_FROM_NAME || 'Chatter OS';

        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'api-key': brevoKey,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: cleanTo }],
            subject,
            htmlContent: html,
            textContent: text
          })
        });

        const brevoData = await brevoRes.json();
        if (brevoRes.ok && brevoData.messageId) {
          console.log(`✅ [Brevo] Verification email dispatched from ${senderEmail} to ${cleanTo} (ID: ${brevoData.messageId})`);
          return {
            success: true,
            provider: 'brevo',
            deliveredTo: cleanTo,
            forwarded: false,
            id: brevoData.messageId
          };
        } else {
          console.warn('⚠️ [Brevo API Error]:', brevoData.message || JSON.stringify(brevoData));
        }
      } catch (brevoErr) {
        console.warn('⚠️ [Brevo Network Warning]:', brevoErr.message);
      }
    }

    // 2. Secondary: Send via Resend HTTPS API (Port 443 — reliable on Render/Cloud)
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
   * Sends approval email notifying user that Superadmin added them to Meta Roles
   */
  async sendApprovalEmail(toEmail, username, instagramHandle, websiteLink) {
    const cleanTo = (toEmail || '').trim().toLowerCase();
    if (!cleanTo) throw new Error('Recipient email is required.');

    const cleanHandle = (instagramHandle || '').trim().replace(/^@/, '');
    const connectUrl = websiteLink || process.env.FRONTEND_URL || 'https://instagram-ebon-zeta.vercel.app/settings';
    const subject = `Chatter OS — Instagram Automation Approved for @${cleanHandle || username}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px 24px; background: #ffffff; border: 1px solid #e4e4e7; border-radius: 14px; color: #09090b;">
        <div style="text-align: center; margin-bottom: 22px;">
          <div style="display: inline-block; background: #09090b; color: #ffffff; font-weight: 800; font-size: 13px; padding: 6px 14px; border-radius: 8px; margin-bottom: 10px;">CHATTER OS</div>
          <h2 style="font-size: 20px; font-weight: 800; margin: 0 0 6px; color: #09090b;">Instagram Automation Approved!</h2>
          <p style="font-size: 13px; color: #71717a; margin: 0;">Your workspace has been whitelisted in Meta App Roles.</p>
        </div>

        <div style="background: #fafafa; border: 1px solid #e4e4e7; border-radius: 10px; padding: 18px 20px; margin-bottom: 22px; font-size: 13px; line-height: 1.6; color: #3f3f46;">
          <p style="margin: 0 0 12px 0;">Hey <strong>${username || 'there'}</strong>,</p>
          <p style="margin: 0 0 14px 0;">The administrator has whitelisted your account <strong>@${cleanHandle}</strong> in the Meta Developer Console. You can now connect your Instagram workspace.</p>

          <div style="font-weight: 700; color: #09090b; margin-bottom: 8px;">Next steps to enable access:</div>
          <ol style="margin: 0; padding-left: 20px;">
            <li style="margin-bottom: 6px;">Open Instagram → <strong>Settings</strong> → <strong>Website Permissions</strong> (or <em>Apps and Websites</em>) → <strong>Tester Invites</strong>.</li>
            <li style="margin-bottom: 6px;">Click <strong>Accept</strong> on the invite from <strong>Chatter</strong>.</li>
            <li style="margin-bottom: 0;">Click the button below to connect your account and activate real-time AI replies.</li>
          </ol>
        </div>

        <div style="text-align: center; margin-bottom: 22px;">
          <a href="${connectUrl}" style="display: inline-block; background: #09090b; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 9px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);">
            Connect Instagram &amp; Generate Token &rarr;
          </a>
        </div>

        <p style="font-size: 11px; color: #a1a1aa; text-align: center; margin: 0; line-height: 1.5;">
          Direct link: <a href="${connectUrl}" style="color: #71717a;">${connectUrl}</a><br/>
          Chatter OS Multi-Tenant Instagram AI Platform
        </p>
      </div>
    `;

    const text = `Hey ${username || 'there'},\n\nYour Instagram automation request for @${cleanHandle} has been approved!\n\n1. Accept the tester invite in Instagram Settings -> Apps and Websites -> Tester Invites.\n2. Open ${connectUrl} and click 'Connect with Instagram'.`;

    // Try Brevo -> Resend -> SMTP
    const brevoKey = process.env.BREVO_API_KEY;
    if (brevoKey) {
      try {
        const senderEmail = process.env.EMAIL_USER || 'guidetalk.app@gmail.com';
        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'api-key': brevoKey,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            sender: { name: 'Chatter OS', email: senderEmail },
            to: [{ email: cleanTo, name: username || 'User' }],
            subject,
            htmlContent: html,
            textContent: text
          })
        });
        const brevoData = await brevoRes.json();
        if (brevoRes.ok && brevoData.messageId) {
          return { success: true, provider: 'brevo', deliveredTo: cleanTo, id: brevoData.messageId };
        }
      } catch (e) {}
    }

    if (!this.resend) this.initResend();
    if (this.resend) {
      try {
        const fromAddress = process.env.RESEND_FROM || 'Chatter OS <onboarding@resend.dev>';
        const result = await this.resend.emails.send({ from: fromAddress, to: [cleanTo], subject, html, text });
        if (result.data?.id) return { success: true, provider: 'resend', deliveredTo: cleanTo, id: result.data.id };
      } catch (e) {}
    }

    if (!this.transporter) this.initMailer();
    if (this.transporter) {
      const info = await this.transporter.sendMail({
        from: `"Chatter OS" <${process.env.EMAIL_USER}>`,
        to: cleanTo,
        subject,
        text,
        html,
      });
      return { success: true, provider: 'smtp', deliveredTo: cleanTo, id: info.messageId };
    }

    return { success: false, message: 'No email service configured' };
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
