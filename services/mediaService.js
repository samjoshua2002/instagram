/**
 * Photos, GIFs and videos someone sends -> a short description, so the AI can react to what it
 * actually sees ("[Sent a photo: a cat in a box]") instead of "[Sent a Photo]".
 * Photos go to the vision model as they are; for a video, 3 frames are pulled out with ffmpeg.
 * Anything that fails returns null and the reply falls back to a natural line.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

async function download(url, max) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > max) throw new Error(`size ${buf.length}`);
  return { buf, type: res.headers.get('content-type') || '' };
}

/** Up to `count` JPEG frames spread over the video (Buffers). */
async function videoFrames(buf, count = 3) {
  let ffmpeg;
  try { ffmpeg = require('ffmpeg-static'); } catch { return []; }
  if (!ffmpeg) return [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmvid-'));
  const input = path.join(dir, 'in.mp4');
  fs.writeFileSync(input, buf);
  try {
    await new Promise((resolve, reject) => execFile(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-i', input,
      '-vf', `fps=1/2,scale=640:-2`, '-frames:v', String(count), path.join(dir, 'f%02d.jpg'),
    ], { timeout: 30000 }, err => (err ? reject(err) : resolve())));
    return fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).sort().map(f => fs.readFileSync(path.join(dir, f)));
  } catch (err) {
    console.warn('⚠️ [Media] Could not read video frames:', err.message);
    return [];
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function describeImages(images, kind) {
  const azureOpenAI = require('./azureOpenAI');
  const { TOP_MODEL } = require('./models');
  const content = [
    { type: 'text', text: `Someone sent this ${kind} in an Instagram DM. In 1-2 short lines say what it shows: people, things, place, any text written in it (quote it), and the mood. If it's a meme or joke, say what the joke is. Plain words, no lists.` },
    ...images.map(({ buf, type }) => ({ type: 'image_url', image_url: { url: `data:${type || 'image/jpeg'};base64,${buf.toString('base64')}` } })),
  ];
  const text = await azureOpenAI.completeWithFallback(TOP_MODEL, [{ role: 'user', content }], { maxTokens: 220 });
  return String(text || '').replace(/\s+/g, ' ').trim() || null;
}

/** Description of a photo / GIF / video at `url`, or null. */
async function describeUrl(url, kind = 'photo') {
  if (!url) return null;
  try {
    if (kind === 'video') {
      const { buf } = await download(url, MAX_VIDEO_BYTES);
      const frames = await videoFrames(buf);
      if (!frames.length) return null;
      return await describeImages(frames.map(f => ({ buf: f, type: 'image/jpeg' })), 'video (frames from it)');
    }
    const img = await download(url, MAX_IMAGE_BYTES);
    if (!/^image\//.test(img.type)) img.type = 'image/jpeg';
    return await describeImages([img], kind);
  } catch (err) {
    console.warn(`⚠️ [Media] Could not look at the ${kind}:`, err.message);
    return null;
  }
}

/** "[Sent a Photo]" / "[Sent a Video]" -> what it shows, or a natural fallback hint. */
function withDescription(text, kind, description) {
  const label = kind === 'video' ? 'Video' : 'Photo';
  const placeholder = `[Sent a ${label}]`;
  const said = description
    ? `[Sent a ${kind}: ${description.replace(/[[\]]/g, '').slice(0, 600)}]`
    : `[Sent a ${kind} you can't open right now. React like a person who'll look later, never say you can't process images.]`;
  const t = String(text || '');
  return t.includes(placeholder) ? t.replace(placeholder, said) : `${t} ${said}`.trim();
}

/** Same as describeUrl, from a file we already have (catch-up for older saved photos/videos). */
async function describeBuffer(buf, contentType = 'image/jpeg', kind = 'photo') {
  try {
    if (kind === 'video') {
      const frames = await videoFrames(buf);
      return frames.length ? await describeImages(frames.map(f => ({ buf: f, type: 'image/jpeg' })), 'video (frames from it)') : null;
    }
    return await describeImages([{ buf, type: /^image\//.test(contentType) ? contentType : 'image/jpeg' }], kind);
  } catch (err) {
    console.warn(`⚠️ [Media] Could not look at a saved ${kind}:`, err.message);
    return null;
  }
}

module.exports = { describeUrl, describeBuffer, withDescription, videoFrames };
