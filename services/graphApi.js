/**
 * One Meta Graph API version for the whole app (override with META_GRAPH_API_VERSION).
 * server.js and routes/auth.js still hardcode v21.0 and should import these instead.
 */
const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v26.0';
const FACEBOOK_GRAPH_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const INSTAGRAM_GRAPH_URL = `https://graph.instagram.com/${GRAPH_API_VERSION}`;

/** Instagram Login tokens start with "IG" and use graph.instagram.com; Page tokens use graph.facebook.com. */
function graphBaseUrl(token) {
  return String(token || '').startsWith('IG') ? INSTAGRAM_GRAPH_URL : FACEBOOK_GRAPH_URL;
}

module.exports = { GRAPH_API_VERSION, FACEBOOK_GRAPH_URL, INSTAGRAM_GRAPH_URL, graphBaseUrl };
