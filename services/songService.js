/**
 * Songs in chat. Instagram's own music sticker is not available to apps, so a song goes out as a
 * link: the AI writes [SONG: artist - title], the song is looked up in Apple's free iTunes search
 * (no key needed) and sent as a song.link page, which opens the same song in Spotify, YouTube,
 * Apple Music or whatever app the friend uses.
 * If the lookup fails, the song's name is sent as plain text instead, like a person would type it.
 */
const SONG_TAG = /\[SONG:\s*([^\]\n]{2,120})\]/i;
const SONG_TAGS = /\s*\[SONG:\s*[^\]\n]{2,120}\]/gi;
const TIMEOUT_MS = 4000;
const CACHE_MS = 7 * 24 * 3600 * 1000;
const cache = new Map();

/** Pure: pulls the first [SONG: ...] tag out of a reply. Returns { text, query } (query '' if none). */
function takeSongTag(reply) {
  const text = String(reply || '');
  const m = text.match(SONG_TAG);
  return { text: text.replace(SONG_TAGS, '').trim(), query: m ? m[1].trim() : '' };
}

/** Pure: the link for an iTunes search result, or null. */
function linkFor(result) {
  const id = result?.trackId;
  return Number.isInteger(id) && id > 0 ? `https://song.link/i/${id}` : null;
}

/**
 * The song's link, or null when it can't be found in time. Never throws.
 * @param {string} query "artist - title"
 */
async function songLink(query, { fetchImpl = globalThis.fetch, country = process.env.SONG_COUNTRY || 'IN' } = {}) {
  const q = String(query || '').replace(/\s+-\s+/g, ' ').trim().slice(0, 120);
  if (!q || typeof fetchImpl !== 'function') return null;
  const key = `${country}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.link;
  try {
    const url = `https://itunes.apple.com/search?entity=song&limit=1&country=${encodeURIComponent(country)}&term=${encodeURIComponent(q)}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const link = linkFor((await res.json())?.results?.[0]);
    cache.set(key, { at: Date.now(), link });
    return link;
  } catch {
    return null;
  }
}

/**
 * Pure-ish: the reply with its song tag turned into a link line (or the song's name when there is
 * no link). Each line is sent as its own message, so the link arrives as its own bubble.
 */
async function withSongLink(reply, opts) {
  const { text, query } = takeSongTag(reply);
  if (!query) return text;
  const link = await songLink(query, opts);
  return [text, link || query].filter(Boolean).join('\n');
}

module.exports = { takeSongTag, linkFor, songLink, withSongLink, _cache: cache };
