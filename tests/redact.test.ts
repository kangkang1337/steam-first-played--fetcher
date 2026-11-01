import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redactSecrets, redactUrl } from '../src/errors.ts';

const KEY = '0123456789abcdef0123456789abcdef';

test('redactUrl hides the API key', () => {
  const redacted = redactUrl(
    'https://api.steampowered.com/IPlayerService/ClientGetLastPlayedTimes/v1/?key=abcdef&format=json',
  );
  assert.ok(!redacted.includes('key=abcdef'));
  assert.ok(redacted.includes('key=REDACTED'));
  assert.ok(redacted.includes('format=json'));
});

test('redactUrl also hides access tokens', () => {
  const redacted = redactUrl('https://example.test/x?access_token=secret&a=1');
  assert.ok(!redacted.includes('secret'));
});

test('redactSecrets masks 32-hex strings', () => {
  const text = redactSecrets(`failed with ${KEY} and key=${KEY}`);
  assert.ok(!text.includes(KEY));
  assert.ok(text.includes('REDACTED_KEY'));
});

test('redactUrl tolerates invalid URLs', () => {
  assert.equal(redactUrl('not a url?key=abc'), 'not a url?key=REDACTED');
});
