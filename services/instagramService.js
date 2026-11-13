const axios = require('axios');
const PersonaConfig = require('../models/PersonaConfig');
const { graphBaseUrl } = require('./graphApi');

// ── Shared axios config ────────────────────────────────────────────────────
const TIMEOUT_MS = 12000; // 12 seconds max per request

// The request never left this machine (no connection was made), so retrying cannot double-send
const PRE_SEND_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH']);
// Transient failures that are safe to retry only for reads (GET): the request may have reached Meta
const READ_FLAKE_CODES = new Set([...PRE_SEND_CODES, 'ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EPIPE']);

/**
 * Should this failed request be retried?
 * - POST (sends): only clear pre-send failures. A timeout / reset after sending may already have
 *   delivered the DM, and retrying would send it twice.
 * - GET: network flakes and 5xx responses.
 */
function isRetryable(err, method = 'POST') {
  if (!err) return false;
  if (String(method).toUpperCase() !== 'GET') return !err.response && PRE_SEND_CODES.has(err.code);
  if (err.response) return err.response.status >= 500;
  return READ_FLAKE_CODES.has(err.code) || /wsarecv|stream reading error/.test(err.message || '');
}

/**
 * Retry helper: retries `fn` up to `maxRetries` times with exponential backoff, only when
 * isRetryable(err, method) says it is safe (see above). `method` defaults to POST.
 */
async function withRetry(fn, maxRetries = 2, label = 'API call', { method = 'POST', baseDelayMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err, method) || attempt === maxRetries) break;
      const delay = baseDelayMs * Math.pow(2, attempt); // 1s, 2s
      console.warn(`⚠️ [${label}] Network flake (attempt ${attempt + 1}), retrying in ${delay}ms… (${err.code || err.response?.status || err.message})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * True only when Meta rejected the request because of the reply_to / mid itself, so resending
 * without reply_to is right. Rate limits, closed messaging windows, auth errors and network
 * failures (which may already have delivered the DM) are not.
 */
function isReplyToError(err) {
  const res = err?.response;
  if (!res || res.status >= 500) return false;
  const e = res.data?.error || {};
  const code = Number(e.code);
  // 4/17/32/613 = rate limits, 10 / 2018278 = outside the messaging window, 190 = bad token
  if ([4, 17, 32, 613, 10, 190].includes(code) || Number(e.error_subcode) === 2018278) return false;
  return /reply_to|reply to|\bmid\b|message[_ ]?id/i.test(`${e.message || ''} ${e.error_user_msg || ''}`);
}

const authHeaders = (token) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });

/**
 * The legacy admin bot's persona (ownerId null). Tenant personas are never used here,
 * so the admin fallback can't pick up another tenant's token or account.
 */
function findAdminConfig() {
  return PersonaConfig.findOne({ ownerId: null });
}

// Echo webhooks for messages this app sent must not be read as the creator typing by hand
const APP_SENT_MID_LIMIT = 2000;

class InstagramService {
  constructor() {
    this.appSentMids = new Set();
    this.sendingTo = new Map(); // recipientId -> sends in flight
    this.sendWaiters = new Map(); // recipientId -> callbacks waiting for those sends to finish
  }

  async trackSend(recipientId, send) {
    this.sendingTo.set(recipientId, (this.sendingTo.get(recipientId) || 0) + 1);
    try {
      const result = await send();
      const mid = result?.data?.message_id;
      if (mid) {
        this.appSentMids.add(mid);
        if (this.appSentMids.size > APP_SENT_MID_LIMIT) this.appSentMids.delete(this.appSentMids.values().next().value);
      }
      return result;
    } finally {
      const left = (this.sendingTo.get(recipientId) || 1) - 1;
      if (left > 0) {
        this.sendingTo.set(recipientId, left);
      } else {
        this.sendingTo.delete(recipientId);
        const waiters = this.sendWaiters.get(recipientId) || [];
        this.sendWaiters.delete(recipientId);
        waiters.forEach(done => done());
      }
    }
  }

  /** Resolves once no send to this contact is in flight (or after maxMs, whichever comes first). */
  waitForSends(recipientId, maxMs = 30000) {
    if (!this.sendingTo.has(recipientId)) return Promise.resolve();
    return new Promise(resolve => {
      let finished = false;
      const done = () => { if (!finished) { finished = true; clearTimeout(timer); resolve(); } };
      const timer = setTimeout(done, maxMs);
      if (timer.unref) timer.unref();
      const list = this.sendWaiters.get(recipientId) || [];
      list.push(done);
      this.sendWaiters.set(recipientId, list);
    });
  }

  /**
   * True when an echo is for a message this app sent. An echo can arrive before our own send has
   * returned its message id, so while a send to this contact is in flight we wait for it to finish
   * and then compare ids: the creator typing on the phone at the same moment is NOT our echo.
   */
  async isAppEcho(recipientId, mid) {
    if (mid && this.appSentMids.has(mid)) return true;
    if (!this.sendingTo.has(recipientId)) return false;
    if (!mid) return true; // no id to compare: keep the old safe answer
    await this.waitForSends(recipientId);
    return this.appSentMids.has(mid);
  }

  /**
   * Admin fallback token (admin persona, then .env). Used only when a caller passes no customToken;
   * tenant callers must always pass their own token.
   */
  async getAccessToken() {
    try {
      const config = await findAdminConfig();
      if (config && config.instagramPageAccessToken && config.instagramPageAccessToken.trim() !== '') {
        return config.instagramPageAccessToken.trim();
      }
    } catch (e) {
      // fallback to process.env
    }
    return process.env.INSTAGRAM_PAGE_ACCESS_TOKEN || '';
  }

  /**
   * Retrieves Instagram Account ID if configured
   */
  async getAccountId() {
    try {
      const config = await findAdminConfig();
      if (config && config.instagramAccountId && config.instagramAccountId.trim() !== '') {
        return config.instagramAccountId.trim();
      }
    } catch (e) {
      // fallback
    }
    return process.env.INSTAGRAM_ACCOUNT_ID || 'me';
  }

  /**
   * Send a text message to a user on Instagram (supports swipe-to-reply via replyToMid)
   */
  sendTextMessage(recipientId, text, customToken = null, replyToMid = null) {
    return this.trackSend(recipientId, () => this.postTextMessage(recipientId, text, customToken, replyToMid));
  }

  async postTextMessage(recipientId, text, customToken = null, replyToMid = null) {
    const token = customToken || await this.getAccessToken();
    if (!token) {
      console.warn("⚠️ Warning: Instagram Page Access Token not configured yet. Response stored in DB, but not sent via Graph API.");
      return { success: false, reason: "No access token configured" };
    }

    const isInstagramToken = token.startsWith('IG');
    const baseUrl = graphBaseUrl(token);
    const accountId = (isInstagramToken || customToken) ? 'me' : await this.getAccountId();
    const url = `${baseUrl}/${accountId}/messages`;

    const requestBody = {
      recipient: { id: recipientId },
      message: { text: text },
    };

    // Attach swipe-to-reply quoted message if mid provided
    if (replyToMid && replyToMid !== 'random_mid' && !replyToMid.startsWith('test_') && !replyToMid.startsWith('manual_')) {
      requestBody.reply_to = { mid: replyToMid };
    }

    // Token in the Authorization header only (never in the URL, where it ends up in logs)
    const axiosConfig = { headers: authHeaders(token), timeout: TIMEOUT_MS };

    try {
      const response = await withRetry(
        () => axios.post(url, requestBody, axiosConfig),
        2,
        `sendTextMessage → ${recipientId}`
      );
      console.log(`📤 Message sent successfully to ${recipientId} (swipe-reply: ${!!requestBody.reply_to}):`, response.data);
      return { success: true, data: response.data };
    } catch (error) {
      // Resend without reply_to only when Meta rejected the quoted mid itself
      if (requestBody.reply_to && isReplyToError(error)) {
        delete requestBody.reply_to;
        try {
          const retryRes = await withRetry(
            () => axios.post(url, requestBody, axiosConfig),
            1,
            `sendTextMessage fallback → ${recipientId}`
          );
          console.log(`📤 Standard message sent successfully (fallback):`, retryRes.data);
          return { success: true, data: retryRes.data };
        } catch (retryErr) {
          // fall through to final error
        }
      }

      const errDetails = error.response ? error.response.data : error.message;
      console.error(`❌ Failed to send Instagram message to ${recipientId}:`, errDetails);
      return { success: false, error: errDetails };
    }
  }

  /**
   * Send a sticker or meme image attachment
   */
  sendImageMessage(recipientId, imageUrl, customToken = null, replyToMid = null) {
    return this.trackSend(recipientId, () => this.postImageMessage(recipientId, imageUrl, customToken, replyToMid));
  }

  async postImageMessage(recipientId, imageUrl, customToken = null, replyToMid = null) {
    const token = customToken || await this.getAccessToken();
    if (!token || !imageUrl) return { success: false };

    const isInstagramToken = token.startsWith('IG');
    const baseUrl = graphBaseUrl(token);
    const accountId = (isInstagramToken || customToken) ? 'me' : await this.getAccountId();
    const url = `${baseUrl}/${accountId}/messages`;

    const requestBody = {
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: 'image',
          payload: { url: imageUrl, is_reusable: true }
        }
      }
    };

    if (replyToMid && !replyToMid.startsWith('test_')) {
      requestBody.reply_to = { mid: replyToMid };
    }

    const axiosConfig = { headers: authHeaders(token), timeout: TIMEOUT_MS };

    try {
      const response = await withRetry(
        () => axios.post(url, requestBody, axiosConfig),
        2,
        `sendImageMessage → ${recipientId}`
      );
      console.log(`🖼️ [Sticker/Image Sent] to ${recipientId}:`, response.data);
      return { success: true, data: response.data };
    } catch (err) {
      // Resend without reply_to only when Meta rejected the quoted mid itself
      if (requestBody.reply_to && isReplyToError(err)) {
        delete requestBody.reply_to;
        try {
          const r2 = await withRetry(
            () => axios.post(url, requestBody, axiosConfig),
            1,
            `sendImageMessage fallback → ${recipientId}`
          );
          return { success: true, data: r2.data };
        } catch (e2) {}
      }
      return { success: false, error: err.response?.data || err.message };
    }
  }

  /**
   * Send typing indicator to create a realistic chatting effect
   */
  async sendSenderAction(recipientId, action = 'typing_on', customToken = null) {
    const token = customToken || await this.getAccessToken();
    if (!token) return;

    const isInstagramToken = token.startsWith('IG');
    const baseUrl = graphBaseUrl(token);
    const accountId = (isInstagramToken || customToken) ? 'me' : await this.getAccountId();
    const url = `${baseUrl}/${accountId}/messages`;

    try {
      await withRetry(
        () => axios.post(
          url,
          { recipient: { id: recipientId }, sender_action: action },
          {
            headers: authHeaders(token),
            timeout: 6000, // shorter timeout for typing indicator — not critical
          }
        ),
        1, // only 1 retry for typing indicator
        `sendSenderAction (${action})`
      );
    } catch (err) {
      // Silent catch — typing indicator is non-critical
    }
  }

  /**
   * React to a message with an emoji (e.g. '😂', '❤️', '🔥')
   */
  async sendMessageReaction(recipientId, messageId, emoji = '😂', customToken = null) {
    const token = customToken || await this.getAccessToken();
    if (!token || !messageId) return;

    const isInstagramToken = token.startsWith('IG');
    const baseUrl = graphBaseUrl(token);
    const accountId = (isInstagramToken || customToken) ? 'me' : await this.getAccountId();
    const url = `${baseUrl}/${accountId}/messages`;

    try {
      await withRetry(
        () => axios.post(
          url,
          {
            recipient: { id: recipientId },
            sender_action: 'react',
            reaction: { message_id: messageId, reaction: emoji },
          },
          {
            headers: authHeaders(token),
            timeout: TIMEOUT_MS,
          }
        ),
        2,
        `sendMessageReaction → ${recipientId}`
      );
      console.log(`❤️ [Reaction Sent] ${emoji} to message ${messageId}`);
    } catch (err) {
      // Catch silently if reaction endpoint has scope restrictions
    }
  }

  /**
   * Fetch user profile (username, name, profile pic) from Graph API
   */
  async getUserProfile(senderId, customToken = null) {
    const token = customToken || await this.getAccessToken();
    if (!token) return null;

    try {
      const url = `${graphBaseUrl(token)}/${senderId}`;
      const res = await withRetry(
        () => axios.get(url, {
          params: { fields: 'name,username,profile_pic' },
          headers: { Authorization: `Bearer ${token}` },
          timeout: TIMEOUT_MS,
        }),
        2,
        `getUserProfile → ${senderId}`,
        { method: 'GET' }
      );
      return res.data;
    } catch (err) {
      console.log(`ℹ️ Note: Could not fetch user profile for ${senderId} (common in dev mode): ${err.message}`);
      return null;
    }
  }
}

module.exports = new InstagramService();
Object.assign(module.exports, { withRetry, isRetryable, isReplyToError });
