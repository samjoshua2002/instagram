const axios = require('axios');
const PersonaConfig = require('../models/PersonaConfig');

// ── Shared axios config ────────────────────────────────────────────────────
const TIMEOUT_MS = 12000; // 12 seconds max per request

/**
 * Retry helper: retries `fn` up to `maxRetries` times with exponential backoff.
 * Only retries on network errors (ECONNRESET, ETIMEDOUT, ECONNABORTED) – not on
 * 4xx/5xx HTTP errors from the Graph API (those are real app errors, not flakes).
 */
async function withRetry(fn, maxRetries = 2, label = 'API call') {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isNetworkFlake = !err.response && (
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNABORTED' ||
        err.code === 'ENETUNREACH' ||
        err.message?.includes('wsarecv') ||
        err.message?.includes('stream reading error')
      );
      if (!isNetworkFlake || attempt === maxRetries) break;
      const delay = 1000 * Math.pow(2, attempt); // 1s, 2s
      console.warn(`⚠️ [${label}] Network flake (attempt ${attempt + 1}), retrying in ${delay}ms… (${err.code || err.message})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

class InstagramService {
  /**
   * Retrieves the current Page Access Token either from DB or .env
   */
  async getAccessToken() {
    try {
      const config = await PersonaConfig.findOne();
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
      const config = await PersonaConfig.findOne();
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
  async sendTextMessage(recipientId, text, customToken = null, replyToMid = null) {
    const token = customToken || await this.getAccessToken();
    if (!token) {
      console.warn("⚠️ Warning: Instagram Page Access Token not configured yet. Response stored in DB, but not sent via Graph API.");
      return { success: false, reason: "No access token configured" };
    }

    const isInstagramToken = token.startsWith('IG');
    const baseUrl = isInstagramToken ? 'https://graph.instagram.com/v26.0' : 'https://graph.facebook.com/v26.0';
    const accountId = isInstagramToken ? 'me' : await this.getAccountId();
    const url = `${baseUrl}/${accountId}/messages`;

    const requestBody = {
      recipient: { id: recipientId },
      message: { text: text },
    };

    // Attach swipe-to-reply quoted message if mid provided
    if (replyToMid && replyToMid !== 'random_mid' && !replyToMid.startsWith('test_') && !replyToMid.startsWith('manual_')) {
      requestBody.reply_to = { mid: replyToMid };
    }

    const axiosConfig = {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      params: { access_token: token },
      timeout: TIMEOUT_MS,
    };

    try {
      const response = await withRetry(
        () => axios.post(url, requestBody, axiosConfig),
        2,
        `sendTextMessage → ${recipientId}`
      );
      console.log(`📤 Message sent successfully to ${recipientId} (swipe-reply: ${!!requestBody.reply_to}):`, response.data);
      return { success: true, data: response.data };
    } catch (error) {
      // If reply_to caused an issue on this message type, retry without reply_to
      if (requestBody.reply_to) {
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
  async sendImageMessage(recipientId, imageUrl, customToken = null, replyToMid = null) {
    const token = customToken || await this.getAccessToken();
    if (!token || !imageUrl) return { success: false };

    const isInstagramToken = token.startsWith('IG');
    const baseUrl = isInstagramToken ? 'https://graph.instagram.com/v26.0' : 'https://graph.facebook.com/v26.0';
    const accountId = isInstagramToken ? 'me' : await this.getAccountId();
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

    const axiosConfig = {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      params: { access_token: token },
      timeout: TIMEOUT_MS,
    };

    try {
      const response = await withRetry(
        () => axios.post(url, requestBody, axiosConfig),
        2,
        `sendImageMessage → ${recipientId}`
      );
      console.log(`🖼️ [Sticker/Image Sent] to ${recipientId}:`, response.data);
      return { success: true, data: response.data };
    } catch (err) {
      // If reply_to failed, retry without reply_to
      if (requestBody.reply_to) {
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
  async sendSenderAction(recipientId, action = 'typing_on') {
    const token = await this.getAccessToken();
    if (!token) return;

    const isInstagramToken = token.startsWith('IG');
    const baseUrl = isInstagramToken ? 'https://graph.instagram.com/v26.0' : 'https://graph.facebook.com/v26.0';
    const accountId = isInstagramToken ? 'me' : await this.getAccountId();
    const url = `${baseUrl}/${accountId}/messages`;

    try {
      await withRetry(
        () => axios.post(
          url,
          { recipient: { id: recipientId }, sender_action: action },
          {
            headers: { 'Content-Type': 'application/json' },
            params: { access_token: token },
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
  async sendMessageReaction(recipientId, messageId, emoji = '😂') {
    const token = await this.getAccessToken();
    if (!token || !messageId) return;

    const isInstagramToken = token.startsWith('IG');
    const baseUrl = isInstagramToken ? 'https://graph.instagram.com/v26.0' : 'https://graph.facebook.com/v26.0';
    const accountId = isInstagramToken ? 'me' : await this.getAccountId();
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
            headers: { 'Content-Type': 'application/json' },
            params: { access_token: token },
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
  async getUserProfile(senderId) {
    const token = await this.getAccessToken();
    if (!token) return null;

    try {
      const isInstagramToken = token.startsWith('IG');
      const baseUrl = isInstagramToken ? 'https://graph.instagram.com/v21.0' : 'https://graph.facebook.com/v21.0';
      const url = `${baseUrl}/${senderId}`;
      const res = await withRetry(
        () => axios.get(url, {
          params: { fields: 'name,username,profile_pic', access_token: token },
          timeout: TIMEOUT_MS,
        }),
        2,
        `getUserProfile → ${senderId}`
      );
      return res.data;
    } catch (err) {
      console.log(`ℹ️ Note: Could not fetch user profile for ${senderId} (common in dev mode): ${err.message}`);
      return null;
    }
  }
}

module.exports = new InstagramService();


class InstagramService {
  /**
   * Retrieves the current Page Access Token either from DB or .env
   */
  async getAccessToken() {
    try {
      const config = await PersonaConfig.findOne();
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
      const config = await PersonaConfig.findOne();
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
  async sendTextMessage(recipientId, text, customToken = null, replyToMid = null) {
    const token = customToken || await this.getAccessToken();
    if (!token) {
      console.warn("⚠️ Warning: Instagram Page Access Token not configured yet. Response stored in DB, but not sent via Graph API.");
      return { success: false, reason: "No access token configured" };
    }

    const isInstagramToken = token.startsWith('IG');
    const baseUrl = isInstagramToken ? 'https://graph.instagram.com/v26.0' : 'https://graph.facebook.com/v26.0';
    const accountId = isInstagramToken ? 'me' : await this.getAccountId();
    const url = `${baseUrl}/${accountId}/messages`;

    const requestBody = {
      recipient: { id: recipientId },
      message: { text: text },
    };

    // Attach swipe-to-reply quoted message if mid provided
    if (replyToMid && replyToMid !== 'random_mid' && !replyToMid.startsWith('test_') && !replyToMid.startsWith('manual_')) {
      requestBody.reply_to = { mid: replyToMid };
    }

    try {
      const response = await axios.post(
        url,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          params: {
            access_token: token,
          },
        }
      );

      console.log(`📤 Message sent successfully to ${recipientId} (swipe-reply: ${!!requestBody.reply_to}):`, response.data);
      return { success: true, data: response.data };
    } catch (error) {
      // If reply_to caused an issue on this message type, seamlessly retry without reply_to
      if (requestBody.reply_to) {
        delete requestBody.reply_to;
        try {
          const retryRes = await axios.post(url, requestBody, {
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            params: { access_token: token },
          });
          console.log(`📤 Standard message sent successfully (fallback):`, retryRes.data);
          return { success: true, data: retryRes.data };
        } catch (retryErr) {
          // fall through
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
  async sendImageMessage(recipientId, imageUrl, customToken = null, replyToMid = null) {
    const token = customToken || await this.getAccessToken();
    if (!token || !imageUrl) return { success: false };

    const isInstagramToken = token.startsWith('IG');
    const baseUrl = isInstagramToken ? 'https://graph.instagram.com/v26.0' : 'https://graph.facebook.com/v26.0';
    const accountId = isInstagramToken ? 'me' : await this.getAccountId();
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

    try {
      const response = await axios.post(url, requestBody, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        params: { access_token: token },
      });
      console.log(`🖼️ [Sticker/Image Sent] to ${recipientId}:`, response.data);
      return { success: true, data: response.data };
    } catch (err) {
      // If reply_to failed, retry without reply_to
      if (requestBody.reply_to) {
        delete requestBody.reply_to;
        try {
          const r2 = await axios.post(url, requestBody, {
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            params: { access_token: token },
          });
          return { success: true, data: r2.data };
        } catch (e2) {}
      }
      return { success: false, error: err.response?.data || err.message };
    }
  }

  /**
   * Send typing indicator to create a realistic chatting effect
   */
  async sendSenderAction(recipientId, action = 'typing_on') {
    const token = await this.getAccessToken();
    if (!token) return;

    const isInstagramToken = token.startsWith('IG');
    const baseUrl = isInstagramToken ? 'https://graph.instagram.com/v26.0' : 'https://graph.facebook.com/v26.0';
    const accountId = isInstagramToken ? 'me' : await this.getAccountId();
    const url = `${baseUrl}/${accountId}/messages`;

    try {
      await axios.post(
        url,
        {
          recipient: { id: recipientId },
          sender_action: action, // 'typing_on', 'typing_off', 'mark_seen'
        },
        {
          headers: { 'Content-Type': 'application/json' },
          params: { access_token: token },
        }
      );
    } catch (err) {
      // Silent catch for typing indicator
    }
  }

  /**
   * React to a message with an emoji (e.g. '😂', '❤️', '🔥')
   */
  async sendMessageReaction(recipientId, messageId, emoji = '😂') {
    const token = await this.getAccessToken();
    if (!token || !messageId) return;

    const isInstagramToken = token.startsWith('IG');
    const baseUrl = isInstagramToken ? 'https://graph.instagram.com/v26.0' : 'https://graph.facebook.com/v26.0';
    const accountId = isInstagramToken ? 'me' : await this.getAccountId();
    const url = `${baseUrl}/${accountId}/messages`;

    try {
      await axios.post(
        url,
        {
          recipient: { id: recipientId },
          sender_action: 'react',
          reaction: {
            message_id: messageId,
            reaction: emoji,
          },
        },
        {
          headers: { 'Content-Type': 'application/json' },
          params: { access_token: token },
        }
      );
      console.log(`❤️ [Reaction Sent] ${emoji} to message ${messageId}`);
    } catch (err) {
      // Catch silently if reaction endpoint has scope restrictions
    }
  }

  /**
   * Fetch user profile (username, name, profile pic) from Graph API
   */
  async getUserProfile(senderId) {
    const token = await this.getAccessToken();
    if (!token) return null;

    try {
      const isInstagramToken = token.startsWith('IG');
      const baseUrl = isInstagramToken ? 'https://graph.instagram.com/v21.0' : 'https://graph.facebook.com/v21.0';
      const url = `${baseUrl}/${senderId}`;
      const res = await axios.get(url, {
        params: {
          fields: 'name,username,profile_pic',
          access_token: token,
        },
      });
      return res.data;
    } catch (err) {
      console.log(`ℹ️ Note: Could not fetch user profile for ${senderId} (common in dev mode): ${err.message}`);
      return null;
    }
  }
}

module.exports = new InstagramService();
