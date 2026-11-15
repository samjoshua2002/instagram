const test = require('node:test');
const assert = require('node:assert');
const { withTranscript, extOf } = require('../services/transcribeService');

test('voice note: the transcript replaces the placeholder', () => {
  const t = withTranscript('[Sent a Voice message]', 'are you coming tonight');
  assert.match(t, /they said: "are you coming tonight"/);
  assert.ok(!t.includes('[Sent a Voice message]'));
});

test('voice note that could not be transcribed gets a human fallback, never "cannot process audio"', () => {
  const t = withTranscript('[Sent a Voice message]', null);
  assert.match(t, /can't listen to right now/);
  assert.match(t, /Never say you are unable to process audio/);
});

test('file type for the speech-to-text upload', () => {
  assert.equal(extOf('audio/mp4'), 'mp4');
  assert.equal(extOf('audio/ogg; codecs=opus'), 'ogg');
  assert.equal(extOf('', 'https://cdn/x/voice.m4a?sig=1'), 'mp4');
  assert.equal(extOf('application/octet-stream', 'https://cdn/x/a.mp3'), 'mp3');
});
