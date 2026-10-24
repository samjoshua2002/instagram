const cryptoService = require('./cryptoService');

/**
 * Stores a creator's connected Instagram account on the User document.
 * With ENCRYPTION_KEY set, the token goes only into user.instagram (AES-256-GCM)
 * and the legacy plaintext field is cleared; without it, the legacy field is used.
 * Returns true when the token was stored encrypted.
 */
function setUserInstagram(user, { token, accountId, pageId, username, expiresAt }) {
  const encrypted = Boolean(token) && cryptoService.isConfigured();
  user.instagram = user.instagram || {};

  if (encrypted) {
    const { encryptedData, iv, authTag } = cryptoService.encrypt(token);
    user.instagram.accessTokenEncrypted = encryptedData;
    user.instagram.iv = iv;
    user.instagram.authTag = authTag;
    user.instagramPageAccessToken = '';
  } else if (token) {
    user.instagramPageAccessToken = token;
  }

  if (accountId) {
    user.instagram.accountId = accountId;
    user.instagramAccountId = accountId;
  }
  if (pageId) user.instagram.pageId = pageId;
  if (username) {
    user.instagram.username = username;
    user.instagramUsername = username;
  }
  user.instagram.tokenExpiresAt = expiresAt || null;
  user.instagram.connected = Boolean(token);
  user.hasInstagramToken = Boolean(token);
  user.isInstagramConnected = Boolean(token);
  return encrypted;
}

/**
 * Returns the creator's Page Access Token: the encrypted one first, then the legacy plaintext field.
 */
function getUserInstagramToken(user) {
  if (!user) return '';
  const ig = user.instagram || {};
  if (ig.accessTokenEncrypted && cryptoService.isConfigured()) {
    try {
      return cryptoService.decrypt({ encryptedData: ig.accessTokenEncrypted, iv: ig.iv, authTag: ig.authTag });
    } catch (err) {
      console.error(`❌ Could not decrypt Instagram token for user ${user._id}:`, err.message);
    }
  }
  return (user.instagramPageAccessToken || '').trim();
}

/**
 * Token to send with for a contact owned by `ownerId`.
 * Returns null for legacy admin contacts (ownerId empty) so instagramService uses the admin token;
 * for a tenant returns their own token, or '' when it cannot be resolved (caller must not send).
 * A tenant never falls back to the admin token.
 */
async function getOwnerSendToken(ownerId) {
  if (!ownerId) return null;
  const User = require('../models/User');
  const PersonaConfig = require('../models/PersonaConfig');
  const owner = await User.findById(ownerId);
  if (!owner || owner.isBanned) return '';
  const token = getUserInstagramToken(owner);
  if (token) return token;
  const config = await PersonaConfig.findOne({ ownerId: owner._id });
  return ((config && config.instagramPageAccessToken) || '').trim();
}

/**
 * Removes every stored Instagram credential from the user.
 */
function clearUserInstagram(user) {
  user.instagram = {
    connected: false, accountId: '', pageId: '', username: '',
    accessTokenEncrypted: '', iv: '', authTag: '', tokenExpiresAt: null,
  };
  user.instagramPageAccessToken = '';
  user.instagramAccountId = '';
  user.hasInstagramToken = false;
  user.isInstagramConnected = false;
}

module.exports = { setUserInstagram, getUserInstagramToken, getOwnerSendToken, clearUserInstagram };
