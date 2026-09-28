const axios = require('axios');
const PersonaConfig = require('../models/PersonaConfig');

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
   * Send a text message to a user on Instagram
   */
  async sendTextMessage(recipientId, text, customToken = null) {
    const token = customToken || await this.getAccessToken();
    if (!token) {
      console.warn("⚠️ Warning: Instagram Page Access Token not configured yet. Response stored in DB, but not sent via Graph API.");
      return { success: false, reason: "No access token configured" };
    }

    const isInstagramToken = token.startsWith('IG');
    const baseUrl = isInstagramToken ? 'https://graph.instagram.com/v26.0' : 'https://graph.facebook.com/v26.0';
    const accountId = isInstagramToken ? 'me' : await this.getAccountId();
    const url = `${baseUrl}/${accountId}/messages`;

    try {
      const response = await axios.post(
        url,
        {
          recipient: { id: recipientId },
          message: { text: text },
        },
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

      console.log(`📤 Message sent successfully to ${recipientId}:`, response.data);
      return { success: true, data: response.data };
    } catch (error) {
      const errDetails = error.response ? error.response.data : error.message;
      console.error(`❌ Failed to send Instagram message to ${recipientId}:`, errDetails);
      return { success: false, error: errDetails };
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
