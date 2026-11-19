/**
 * Voice notes -> text, so the AI answers what they actually said instead of "can't hear".
 * Uses an Azure OpenAI speech-to-text deployment: AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT if set, else
 * the usual names are tried in turn (gpt-4o-mini-transcribe, gpt-4o-transcribe, whisper, whisper-1)
 * and the first that exists is remembered. If none exists or it fails, returns null and the reply
 * falls back to a natural "can't listen right now" line.
 */
const MAX_BYTES = 25 * 1024 * 1024;
const UNAVAILABLE_MS = 10 * 60 * 1000;
let unavailableUntil = 0;

const CANDIDATES = ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper', 'whisper-1'];
let found = null; // the deployment that answered last time
const candidates = () => (process.env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT
  ? [process.env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT]
  : (found ? [found] : CANDIDATES));

function extOf(type, url) {
  const t = String(type || '').toLowerCase();
  if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) return 'mp4';
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
  if (t.includes('ogg') || t.includes('opus')) return 'ogg';
  if (t.includes('wav')) return 'wav';
  if (t.includes('webm')) return 'webm';
  const m = String(url || '').split('?')[0].match(/\.(mp4|m4a|mp3|ogg|oga|wav|webm|aac)$/i);
  return m ? m[1].toLowerCase().replace('oga', 'ogg').replace('aac', 'mp4').replace('m4a', 'mp4') : 'mp4';
}

/** Transcript of the audio at `url`, or null. */
async function transcribeUrl(url) {
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
  const key = process.env.AZURE_OPENAI_API_KEY;
  if (!url || !endpoint || !key || Date.now() < unavailableUntil) return null;
  try {
    const audio = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!audio.ok) throw new Error(`download ${audio.status}`);
    const buf = Buffer.from(await audio.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) throw new Error(`size ${buf.length}`);
    const type = audio.headers.get('content-type') || 'audio/mp4';
    // Same upload to each deployment name until one exists (404 = no such deployment)
    let res = null;
    for (const name of candidates()) {
      const form = new FormData();
      form.append('file', new Blob([buf], { type }), `voice.${extOf(type, url)}`);
      form.append('response_format', 'json');
      res = await fetch(
        `${endpoint}/openai/deployments/${encodeURIComponent(name)}/audio/transcriptions?api-version=2025-03-01-preview`,
        { method: 'POST', headers: { 'api-key': key }, body: form, signal: AbortSignal.timeout(45000) },
      );
      if (res.status !== 404) { found = name; break; }
    }
    if (!res || res.status === 404) {
      found = null;
      unavailableUntil = Date.now() + UNAVAILABLE_MS;
      console.warn(`⚠️ [Voice note] No speech-to-text deployment in Azure (tried ${candidates().join(', ')}). Deploy gpt-4o-mini-transcribe or whisper to transcribe voice notes.`);
      return null;
    }
    if (!res.ok) throw new Error(`transcribe ${res.status}`);
    const data = await res.json();
    const text = String(data.text || '').replace(/\s+/g, ' ').trim();
    return text || null;
  } catch (err) {
    console.warn('⚠️ [Voice note] Could not transcribe:', err.message);
    return null;
  }
}

/**
 * Message text with "[Sent a Voice message]" replaced by what was said, or by a hint that keeps
 * the reply human when the audio could not be understood.
 */
function withTranscript(text, transcript) {
  const t = String(text || '');
  const said = transcript
    ? `[Voice message, they said: "${transcript.replace(/"/g, "'").slice(0, 1500)}"]`
    : `[Sent a voice message you can't listen to right now. Reply like a person who will listen later or asks them to type it, e.g. "cant listen rn, wht happened?". Never say you are unable to process audio.]`;
  return t.includes('[Sent a Voice message]') ? t.replace('[Sent a Voice message]', said) : `${t} ${said}`.trim();
}

module.exports = { transcribeUrl, withTranscript, extOf };
