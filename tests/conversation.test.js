const test = require('node:test');
const assert = require('node:assert');
const { isFiller, isStalled, stalledBlock, findRepeat } = require('../services/repeatGuard');
const { checkInGuide } = require('../services/checkInVoice');
const songService = require('../services/songService');

test('fillers: greetings and "nothing u tell" say nothing new; real topics do', () => {
  for (const t of ['wassup', 'Wassup bro', 'nothing much u tell', 'nm wbu', 'hmm', 'ok da', 'hii', 'enna da', 'nee sollu', 'lol']) {
    assert.equal(isFiller(t), true, t);
  }
  for (const t of ['did u finish the drawing', 'exam tmrw da', 'watching the match', 'nothing much, just studying for the exam']) {
    assert.equal(isFiller(t), false, t);
  }
});

test('a chat is stalled only when both sides have been trading fillers', () => {
  const loop = [
    { role: 'user', text: 'wassup' },
    { role: 'assistant', text: 'nothing much u tell' },
    { role: 'user', text: 'nothing bro you tell' },
    { role: 'assistant', text: 'wassup' },
  ];
  assert.equal(isStalled(loop), true);
  assert.match(stalledBlock(loop), /GOING NOWHERE/);
  assert.match(stalledBlock(loop), /overrides the rule to stop asking/);
  // A real topic anywhere in the last 4, too few messages, or only one side talking: not stalled
  assert.equal(isStalled([...loop.slice(0, 3), { role: 'assistant', text: 'how was the exam' }]), false);
  assert.equal(isStalled(loop.slice(0, 3)), false);
  assert.equal(isStalled(loop.map(m => ({ ...m, role: 'user' }))), false);
  assert.equal(stalledBlock(loop.slice(0, 3)), '');
});

test('a short reply is not sent again word for word ("wassup" twice); laughs may repeat', () => {
  const history = [
    { role: 'user', text: 'yo' },
    { role: 'assistant', text: 'wassup' },
    { role: 'user', text: 'nothing' },
    { role: 'assistant', text: 'lol' },
  ];
  assert.equal(findRepeat('Wassup!', history), 'wassup');
  assert.equal(findRepeat('lol', history), null);
  assert.equal(findRepeat('haha', history), null);
  assert.equal(findRepeat('u tell', history), null);
});

test('two AIs chatting: the loop is caught by the 4th filler and the next "wassup" is refused', () => {
  // Side A and side B each see the chat from their own point of view (their messages are "assistant")
  const said = [];
  const viewOf = side => said.map(m => ({ role: m.side === side ? 'assistant' : 'user', text: m.text }));
  const script = [['A', 'wassup'], ['B', 'nothing much u tell'], ['A', 'nothing bro u tell'], ['B', 'wassup']];
  const stalledAt = [];
  for (const [side, text] of script) {
    said.push({ side, text });
    if (isStalled(viewOf(side === 'A' ? 'B' : 'A'))) stalledAt.push(said.length);
  }
  assert.deepEqual(stalledAt, [4], 'the side about to answer gets the lead-the-chat note after 4 fillers');
  // A was about to send "wassup" again: that is a word-for-word repeat of its own recent reply
  assert.equal(findRepeat('wassup', viewOf('A')), 'wassup');
});

test('check-ins follow up on something real before falling back to a greeting', () => {
  const guide = checkInGuide({ askHint: 'what they are studying' });
  assert.match(guide, /First look for something to follow up on/);
  assert.match(guide, /Only if there is nothing worth following up/);
  assert.match(guide, /a good one: what they are studying/);
  assert.match(guide, /Never invent an event/);
  assert.match(guide, /HOW TO WRITE IT: exactly like your openers/);
  assert.doesNotMatch(checkInGuide(), /a good one/);
});

test('songs: the [SONG] tag becomes a song.link line; no link found sends the name', async () => {
  songService._cache.clear();
  assert.deepEqual(songService.takeSongTag('this one [SONG: Anirudh - Arabic Kuthu]'), { text: 'this one', query: 'Anirudh - Arabic Kuthu' });
  assert.deepEqual(songService.takeSongTag('no song here'), { text: 'no song here', query: '' });

  const calls = [];
  const fetchImpl = async url => { calls.push(url); return { ok: true, json: async () => ({ results: [{ trackId: 1609971105 }] }) }; };
  assert.equal(await songService.withSongLink('on repeat rn [SONG: Anirudh - Arabic Kuthu]', { fetchImpl }), 'on repeat rn\nhttps://song.link/i/1609971105');
  assert.match(calls[0], /itunes\.apple\.com\/search\?entity=song&limit=1&country=IN&term=Anirudh%20Arabic%20Kuthu/);
  await songService.withSongLink('again [SONG: anirudh - arabic kuthu]', { fetchImpl });
  assert.equal(calls.length, 1, 'the same song is looked up once');

  const none = async () => ({ ok: true, json: async () => ({ results: [] }) });
  assert.equal(await songService.withSongLink('try [SONG: Nobody - Nothing]', { fetchImpl: none }), 'try\nNobody - Nothing');
  const down = async () => { throw new Error('offline'); };
  assert.equal(await songService.withSongLink('[SONG: X - Y]', { fetchImpl: down }), 'X - Y');
  assert.equal(await songService.withSongLink('just text', { fetchImpl: down }), 'just text');
});

test('vault from chats: only reusable reaction images in a real category are kept', () => {
  const { parseVerdict, publicUrl } = require('../services/chatMediaVault');
  const cats = ['joy', 'lol', 'sad'];
  assert.deepEqual(parseVerdict({ reusable: true, category: 'LOL', name: 'Yellow blob smirking', keywords: ['Smug', 'hehe', '', 'x'.repeat(50)] }, cats),
    { name: 'Yellow blob smirking', category: 'lol', keywords: ['smug', 'hehe', 'x'.repeat(30)] });
  assert.equal(parseVerdict({ reusable: false, category: 'lol' }, cats), null, 'personal photos are never kept');
  assert.equal(parseVerdict({ reusable: true, category: 'made_up' }, cats), null);
  assert.equal(parseVerdict(null, cats), null);
  assert.equal(parseVerdict({ reusable: true, category: 'joy' }, cats).name, 'Sticker from a chat');
  assert.equal(publicUrl('abc', 'https://api.example.com/'), 'https://api.example.com/vault-media/abc');
});

test('vault from chats: WebP stickers get a PNG copy for sending; PNG, JPEG and GIF go as they are', async () => {
  const { needsPng } = require('../services/chatMediaVault');
  for (const t of ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'IMAGE/PNG; charset=binary']) assert.equal(needsPng(t), false, t);
  for (const t of ['image/webp', 'image/heic', '', 'application/octet-stream']) assert.equal(needsPng(t), true, t);
  // A real WebP (made with ffmpeg) converts to a real PNG
  const { toPng } = require('../services/mediaService');
  const ffmpeg = require('ffmpeg-static');
  const { execFileSync } = require('child_process');
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webp-test-'));
  try {
    const webp = path.join(dir, 'a.webp');
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=yellow:s=64x64', '-frames:v', '1', webp]);
    const png = await toPng(fs.readFileSync(webp), 'webp');
    assert.ok(png && png.subarray(1, 4).toString() === 'PNG', 'PNG signature');
    assert.equal(await toPng(Buffer.from('not an image'), 'webp'), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
