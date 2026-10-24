const axios = require('axios');
const User = require('../models/User');
const { setUserInstagram, getUserInstagramToken } = require('./instagramTokenService');

const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_WINDOW_DAYS = 15;

// Users that hold an Instagram token, encrypted or legacy plaintext
const TOKEN_HOLDERS = {
  $or: [
    { 'instagram.accessTokenEncrypted': { $nin: ['', null] } },
    { instagramPageAccessToken: { $nin: ['', null] } },
  ],
};

// Instagram Login tokens ("IG...") expire after 60 days and can be refreshed;
// Facebook Page tokens ("EAA...") from a long-lived user token normally never expire.
const isInstagramLoginToken = (token) => /^IG/.test(token || '');

function healthOf(expiresAt, isValid = true) {
  if (!isValid) return 'red';
  if (!expiresAt) return 'green'; // no expiry
  const daysLeft = (new Date(expiresAt).getTime() - Date.now()) / DAY_MS;
  if (daysLeft <= 0) return 'red';
  return daysLeft > 30 ? 'green' : 'amber';
}

/**
 * Asks Meta whether a Facebook token is valid and when it expires.
 * Returns { isValid, expiresAt } or null when it cannot be checked.
 */
async function inspectFacebookToken(token) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret || isInstagramLoginToken(token)) return null;
  try {
    const { data } = await axios.get('https://graph.facebook.com/v21.0/debug_token', {
      params: { input_token: token, access_token: `${appId}|${appSecret}` },
    });
    const info = data?.data || {};
    return {
      isValid: Boolean(info.is_valid),
      expiresAt: info.expires_at ? new Date(info.expires_at * 1000) : null,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Refreshes (Instagram Login tokens) or re-checks (Facebook Page tokens) one user's token
 * and stores the result. Returns { status, expiresAt, refreshed, error? }.
 */
async function refreshUserToken(user) {
  const token = getUserInstagramToken(user);
  if (!token) return { status: 'red', expiresAt: null, refreshed: false, error: 'No token stored' };

  try {
    if (isInstagramLoginToken(token)) {
      const { data } = await axios.get('https://graph.instagram.com/refresh_access_token', {
        params: { grant_type: 'ig_refresh_token', access_token: token },
      });
      const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
      setUserInstagram(user, {
        token: data.access_token || token,
        accountId: user.instagram?.accountId || user.instagramAccountId,
        pageId: user.instagram?.pageId,
        username: user.instagram?.username || user.instagramUsername,
        expiresAt,
      });
      await user.save();
      return { status: healthOf(expiresAt), expiresAt, refreshed: true };
    }

    const info = await inspectFacebookToken(token);
    if (!info) return { status: healthOf(user.instagram?.tokenExpiresAt), expiresAt: user.instagram?.tokenExpiresAt || null, refreshed: false, error: 'Could not reach Meta to check this token' };
    user.instagram = user.instagram || {};
    user.instagram.tokenExpiresAt = info.expiresAt;
    if (!info.isValid) user.instagram.connected = false;
    await user.save();
    return { status: healthOf(info.expiresAt, info.isValid), expiresAt: info.expiresAt, refreshed: false, ...(info.isValid ? {} : { error: 'Token was revoked or expired; the creator must reconnect' }) };
  } catch (err) {
    return { status: 'red', expiresAt: user.instagram?.tokenExpiresAt || null, refreshed: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Token health for every tenant with a connected account (no token values are returned).
 */
async function listTokenHealth() {
  const users = await User.find(TOKEN_HOLDERS)
    .select('username email accountType instagram instagramUsername instagramAccountId instagramPageAccessToken isBanned');
  return users.map(u => {
    const expiresAt = u.instagram?.tokenExpiresAt || null;
    const connected = u.instagram?.connected !== false;
    return {
      userId: u._id,
      username: u.username,
      email: u.email,
      accountType: u.accountType || 'personal',
      instagramUsername: u.instagram?.username || u.instagramUsername || '',
      instagramAccountId: u.instagram?.accountId || u.instagramAccountId || '',
      encrypted: Boolean(u.instagram?.accessTokenEncrypted),
      tokenType: u.instagram?.accessTokenEncrypted ? 'stored' : 'legacy',
      expiresAt,
      daysLeft: expiresAt ? Math.floor((new Date(expiresAt).getTime() - Date.now()) / DAY_MS) : null,
      status: healthOf(expiresAt, connected),
      isBanned: Boolean(u.isBanned),
    };
  });
}

/**
 * Daily job: refresh tokens expiring within 15 days, plus Instagram Login tokens with no known expiry.
 */
async function runDailyRefresh() {
  const soon = new Date(Date.now() + REFRESH_WINDOW_DAYS * DAY_MS);
  const users = await User.find({ ...TOKEN_HOLDERS, isBanned: { $ne: true } });
  let checked = 0, refreshed = 0, failed = 0;
  for (const user of users) {
    const expiresAt = user.instagram?.tokenExpiresAt;
    const needsCheck = expiresAt ? new Date(expiresAt) <= soon : isInstagramLoginToken(getUserInstagramToken(user));
    if (!needsCheck) continue;
    checked++;
    const result = await refreshUserToken(user);
    if (result.error) {
      failed++;
      console.warn(`⚠️ [TokenRefresh] User ${user._id}: ${result.error}`);
    } else if (result.refreshed) {
      refreshed++;
    }
  }
  console.log(`🔄 [TokenRefresh] checked=${checked} refreshed=${refreshed} failed=${failed}`);
  return { checked, refreshed, failed };
}

module.exports = { listTokenHealth, refreshUserToken, runDailyRefresh, healthOf };
