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
const { setUserInstagram } = require('./instagramTokenService');

// Never fall back to a secret written in the code: anyone who reads it could sign sessions
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(48).toString('hex');
if (!process.env.JWT_SECRET) console.warn('⚠️ JWT_SECRET is not set: using a random secret, so sessions end when the server restarts.');
const RP_NAME = process.env.RP_NAME || 'Chatter OS';
const TOTP_TOLERANCE_SECONDS = 30;

// ---------- Pure helpers (no database; unit-tested in tests/auth.test.js) ----------

const splitList = (raw) => String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);

// Escapes text for HTML element content and quoted attributes
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;',
  }[c]));
}

// JSON for an inline <script>: cannot close the tag, open a comment or break the line
function safeJsonForScript(value) {
  const json = JSON.stringify(value === undefined ? null : value);
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// A TOTP time-step may be used once: it must be newer than the last accepted one
function isTotpStepFresh(lastUsedStep, step) {
  if (!Number.isFinite(step) || step <= 0) return false;
  const last = Number(lastUsedStep) || 0;
  return step > last;
}

function isTokenVersionCurrent(decoded, user) {
  if (!decoded || !user) return false;
  return (Number(decoded.tokenVersion) || 0) === (Number(user.tokenVersion) || 0);
}

// Returns the trimmed string, '' for missing values, or null when the value is not a string
function asString(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  return value.trim();
}

// Maps a stored upload URL (".../uploads/<file>") to a file directly inside uploadsDir, or null
function resolveUploadPath(url, uploadsDir) {
  const path = require('path');
  if (typeof url !== 'string' || !url.includes('/uploads/')) return null;
  let name = url.split('/uploads/').pop().split(/[?#]/)[0];
  try { name = decodeURIComponent(name); } catch { return null; }
  if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') return null;
  const root = path.resolve(uploadsDir);
  const full = path.resolve(root, name);
  if (path.dirname(full) !== root) return null;
  return full;
}

// Reads the challenge out of a WebAuthn clientDataJSON (base64url)
function challengeFromClientData(clientDataJSON) {
  if (typeof clientDataJSON !== 'string' || clientDataJSON.length > 8192) return null;
  try {
    const data = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8'));
    return typeof data?.challenge === 'string' && data.challenge ? data.challenge : null;
  } catch {
    return null;
  }
}

// Short-lived single-use values (passkey challenges), in memory
class ChallengeStore {
  constructor({ ttlMs = 5 * 60 * 1000, maxEntries = 10000, now = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    this.items = new Map();
  }

  put(key, value) {
    this.prune();
    if (this.items.size >= this.maxEntries) this.items.delete(this.items.keys().next().value);
    this.items.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  take(key) {
    const item = this.items.get(key);
    this.items.delete(key);
    if (!item || item.expiresAt <= this.now()) return null;
    return item.value;
  }

  prune() {
    const t = this.now();
    for (const [k, v] of this.items) if (v.expiresAt <= t) this.items.delete(k);
  }
}

const passkeyChallenges = new ChallengeStore();

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
   * Creates the primary owner (superadmin) account on first boot.
   * The initial password comes from OWNER_INITIAL_PASSWORD; without it no owner is created.
   * The role is set only on creation, so a later role change in the admin panel is kept.
   */
  async ensureOwnerUser() {
    try {
      const superadminEmail = (process.env.OWNER_EMAIL || 'samjoshuacs2002@gmail.com').trim().toLowerCase();
      const ownerUsername = (process.env.OWNER_USERNAME || 'samjoshua2002').trim().toLowerCase();
      let user = await User.findOne({
        $or: [{ email: superadminEmail }, { username: ownerUsername }]
      });

      const totpSecret = generateSecret();

      if (!user) {
        const initialPassword = process.env.OWNER_INITIAL_PASSWORD;
        if (!initialPassword || initialPassword.length < 12) {
          console.warn('⚠️ [AuthService]: Owner account not found and OWNER_INITIAL_PASSWORD is not set (min 12 chars); skipping owner creation.');
          return null;
        }
        const initialHash = await User.hashPassword(initialPassword);
        user = new User({
          username: ownerUsername,
          email: superadminEmail,
          passwordHash: initialHash,
          firstName: 'Sam',
          lastName: 'Joshua',
          role: 'superadmin',
          accountType: 'personal',
          isVerified: true,
          twoFactor: {
            enabled: true,
            secret: totpSecret,
          },
        });
        await user.save();
        console.log(`🔐 [AuthService]: Created primary superadmin account (${superadminEmail}). Change the initial password and remove OWNER_INITIAL_PASSWORD.`);
      } else {
        let changed = false;
        const envAccountId = (process.env.INSTAGRAM_ACCOUNT_ID || '').trim();
        if (envAccountId) {
          const claimedByOther = await User.exists({
            _id: { $ne: user._id },
            $or: [{ instagramAccountId: envAccountId }, { instagramId: envAccountId }, { 'instagram.accountId': envAccountId }]
          });
          if (claimedByOther) {
            // Another workspace owns this Instagram account: drop only the owner's own env-based link
            if (user.instagramAccountId === envAccountId || user.instagram?.accountId === envAccountId) {
              user.instagramAccountId = '';
              user.instagramId = '';
              user.instagramUsername = '';
              user.instagram = { connected: false, accountId: '', pageId: '', username: '' };
              changed = true;
            }
          } else {
            if (!user.instagramPageAccessToken && !user.instagram?.accessTokenEncrypted && process.env.INSTAGRAM_PAGE_ACCESS_TOKEN) {
              setUserInstagram(user, { token: process.env.INSTAGRAM_PAGE_ACCESS_TOKEN, accountId: envAccountId });
              changed = true;
            }
            if (!user.instagramAccountId) {
              user.instagramAccountId = envAccountId;
              changed = true;
            }
          }
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
   * Sign a JWT session token (valid for 30 days; impersonation sessions 12 hours).
   * tokenVersion ties the token to the account's current password / role / ban state.
   */
  generateToken(user, { impersonatedBy = null } = {}) {
    const isSuper = user.role === 'superadmin';
    const claims = {
      userId: user._id.toString(),
      username: user.username,
      email: user.email,
      accountType: user.accountType || 'personal',
      role: isSuper ? 'superadmin' : 'user',
      instagramId: user.instagramId || '',
      firstName: user.firstName,
      lastName: user.lastName,
      tokenVersion: user.tokenVersion || 0,
    };
    if (impersonatedBy) {
      claims.impersonatedBy = impersonatedBy._id.toString();
      claims.impersonatorTokenVersion = impersonatedBy.tokenVersion || 0;
    }
    return jwt.sign(claims, JWT_SECRET, { expiresIn: impersonatedBy ? '12h' : '30d' });
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

  // True when a decoded JWT still matches the account (tokens without tokenVersion count as 0)
  isTokenCurrent(decoded, user) {
    return isTokenVersionCurrent(decoded, user);
  }

  // Invalidates every existing session of this user (caller saves the document)
  bumpTokenVersion(user) {
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    return user.tokenVersion;
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
          // Never redirect a user's code to a shared inbox (e.g. Resend sandbox mode): fail instead
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
      throw new Error('Email service is not configured. Please ensure BREVO_API_KEY, RESEND_API_KEY or EMAIL_USER is set.');
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
   * Check a 6-digit TOTP code from OneAuth / Authenticator app.
   * Returns { valid, timeStep } without consuming the code (see consumeTotp).
   */
  checkTotp(user, token) {
    if (!user?.twoFactor?.secret) return { valid: false, timeStep: 0 };
    const cleanToken = (token ?? '').toString().trim();
    if (!/^\d{6}$/.test(cleanToken)) return { valid: false, timeStep: 0 };
    try {
      // epochTolerance is in seconds: 30 = the previous / next 30 s code (one time-step) for clock drift
      const result = verifySync({ token: cleanToken, secret: user.twoFactor.secret, epochTolerance: TOTP_TOLERANCE_SECONDS });
      if (!result?.valid) return { valid: false, timeStep: 0 };
      return { valid: true, timeStep: Number(result.timeStep) || 0 };
    } catch (err) {
      console.warn('⚠️ [AuthService] TOTP verify error:', err.message);
      return { valid: false, timeStep: 0 };
    }
  }

  verifyTotp(user, token) {
    return this.checkTotp(user, token).valid;
  }

  /**
   * Verify a TOTP code and burn its time-step so the same code cannot be used twice.
   * The update is atomic, so two parallel requests with one code cannot both pass.
   * Returns 'ok' | 'invalid' | 'replayed'.
   */
  async consumeTotp(user, token) {
    const { valid, timeStep } = this.checkTotp(user, token);
    if (!valid) return 'invalid';
    if (!isTotpStepFresh(user.twoFactor?.lastUsedStep, timeStep)) return 'replayed';
    const result = await User.updateOne(
      {
        _id: user._id,
        $or: [
          { 'twoFactor.lastUsedStep': { $exists: false } },
          { 'twoFactor.lastUsedStep': null },
          { 'twoFactor.lastUsedStep': { $lt: timeStep } },
        ],
      },
      { $set: { 'twoFactor.lastUsedStep': timeStep } }
    );
    if (!result?.modifiedCount) return 'replayed';
    if (user.twoFactor) user.twoFactor.lastUsedStep = timeStep;
    return 'ok';
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

  // Relying-party IDs and origins: PASSKEY_RP_ID / PASSKEY_ORIGIN (comma-separated) when set,
  // otherwise derived from the request as before.
  getAllowedRpIds() {
    return splitList(process.env.PASSKEY_RP_ID);
  }

  getAllowedOrigins() {
    return splitList(process.env.PASSKEY_ORIGIN).map((o) => o.replace(/\/+$/, ''));
  }

  getRequestRpID(req) {
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

  getRequestOrigin(req) {
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

  // One rpID for generating options: the configured one matching the caller's host, else the first
  getRpID(req) {
    const allowed = this.getAllowedRpIds();
    if (!allowed.length) return this.getRequestRpID(req);
    const host = this.getRequestRpID(req);
    return allowed.find((id) => host === id || host.endsWith(`.${id}`)) || allowed[0];
  }

  // What verification accepts (string or list)
  getExpectedRpIDs(req) {
    const allowed = this.getAllowedRpIds();
    return allowed.length ? allowed : this.getRequestRpID(req);
  }

  getExpectedOrigins(req) {
    const allowed = this.getAllowedOrigins();
    return allowed.length ? allowed : this.getRequestOrigin(req);
  }

  getOrigin(req) {
    const allowed = this.getAllowedOrigins();
    return allowed.length ? allowed[0] : this.getRequestOrigin(req);
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
    if (!expectedChallenge) return false;
    const expectedOrigin = this.getExpectedOrigins(req);
    const expectedRPID = this.getExpectedRpIDs(req);

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

  /**
   * Login options. Every challenge is also kept server-side (5 min, single use), so a
   * discoverable "no username" login is checked against a challenge this server issued.
   */
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

    passkeyChallenges.put(options.challenge, { userId: user ? user._id.toString() : null });
    if (user) {
      user.currentChallenge = options.challenge;
      await user.save();
    }
    return options;
  }

  /**
   * Verifies a login assertion against a challenge issued by generatePasskeyAuthenticationOptions.
   * The challenge is read from the signed clientDataJSON and must be one we issued and not yet used.
   */
  async verifyPasskeyAuthentication(user, response, req) {
    const passkey = (user.passkeys || []).find(p => p.credentialId === response?.id);
    if (!passkey) {
      throw new PasskeyError('Passkey not registered on this account.');
    }

    const presented = challengeFromClientData(response?.response?.clientDataJSON);
    const issued = presented ? passkeyChallenges.take(presented) : null;
    if (!issued) {
      throw new PasskeyError('This passkey request has expired. Please try again.');
    }
    if (issued.userId && issued.userId !== user._id.toString()) {
      throw new PasskeyError('Passkey does not match the requested account.');
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: presented,
      expectedOrigin: this.getExpectedOrigins(req),
      expectedRPID: this.getExpectedRpIDs(req),
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

class PasskeyError extends Error {}

const instance = new AuthService();
Object.assign(instance, {
  PasskeyError,
  passkeyChallenges,
  escapeHtml,
  safeJsonForScript,
  isTotpStepFresh,
  isTokenVersionCurrent,
  asString,
  resolveUploadPath,
  challengeFromClientData,
  ChallengeStore,
});
module.exports = instance;
