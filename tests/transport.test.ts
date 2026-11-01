import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLastPlayedTimesUrl } from '../src/api/steam-client.ts';
import { Transport } from '../src/api/transport.ts';
import { AppError } from '../src/errors.ts';
import { FAKE_API_KEY, errorWithCode, jsonResponse } from './helpers.ts';

type Captured = { url: string; init: RequestInit & { dispatcher?: unknown } };

test('direct GET carries key, format and min_last_played in the query', async () => {
  const captured: Captured[] = [];
  const transport = new Transport({
    fetchImpl: async (url, init) => {
      captured.push({ url, init });
      return jsonResponse({ response: {} });
    },
  });
  await transport.get(buildLastPlayedTimesUrl(FAKE_API_KEY, 0));
  assert.equal(captured.length, 1);
  const call = captured[0]!;
  assert.equal(call.init.method, 'GET');
  assert.equal(call.init.dispatcher, undefined);
  const parsed = new URL(call.url);
  assert.equal(parsed.host, 'api.steampowered.com');
  assert.equal(parsed.pathname, '/IPlayerService/ClientGetLastPlayedTimes/v1/');
  assert.equal(parsed.searchParams.get('key'), FAKE_API_KEY);
  assert.equal(parsed.searchParams.get('min_last_played'), '0');
  assert.equal(parsed.searchParams.get('format'), 'json');
  await transport.close();
});

test('min_last_played is omitted for a full fetch', () => {
  const url = new URL(buildLastPlayedTimesUrl(FAKE_API_KEY));
  assert.equal(url.searchParams.has('min_last_played'), false);
});

test('proxy mode is reported even when fetch is injected', async () => {
  const transport = new Transport({
    proxyUrl: 'http://127.0.0.1:9',
    fetchImpl: async () => jsonResponse({ response: {} }),
  });
  const response = await transport.get('https://example.test/');
  assert.equal(response.usedProxy, true);
  await transport.close();
});

test('timeouts are classified as timeout', async () => {
  const error = new Error('timed out');
  error.name = 'TimeoutError';
  const transport = new Transport({
    fetchImpl: async () => {
      throw error;
    },
  });
  await assert.rejects(
    () => transport.get('https://example.test/'),
    (err: unknown) => err instanceof AppError && err.category === 'timeout',
  );
});

test('explicit proxy connection failures never fall back to direct', async () => {
  const transport = new Transport({
    proxyUrl: 'http://127.0.0.1:9',
    fetchImpl: async () => {
      throw errorWithCode('ECONNREFUSED');
    },
  });
  await assert.rejects(
    () => transport.get('https://example.test/'),
    (err: unknown) => err instanceof AppError && err.category === 'proxy-connection-failed',
  );
});

test('DNS failures are classified as dns-network', async () => {
  const transport = new Transport({
    fetchImpl: async () => {
      throw errorWithCode('ENOTFOUND');
    },
  });
  await assert.rejects(
    () => transport.get('https://example.test/'),
    (err: unknown) => err instanceof AppError && err.category === 'dns-network',
  );
});

test('error details never contain the plaintext API key', async () => {
  const transport = new Transport({
    fetchImpl: async () => {
      throw errorWithCode('ECONNRESET');
    },
  });
  try {
    await transport.get(buildLastPlayedTimesUrl(FAKE_API_KEY));
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err instanceof AppError);
    assert.ok(!JSON.stringify(err.details).includes(FAKE_API_KEY));
  }
});

test('close is safe to call without a proxy', async () => {
  const transport = new Transport({ fetchImpl: async () => jsonResponse({}) });
  await transport.close();
  await transport.close();
});
