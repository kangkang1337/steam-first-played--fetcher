import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppError } from '../src/errors.ts';
import { fetchLastPlayedData } from '../src/fetcher.ts';
import { FAKE_API_KEY, jsonResponse, makeTransport } from './helpers.ts';

test('fetch normalizes records and fills metadata', async () => {
  const transport = makeTransport(async () =>
    jsonResponse({
      response: {
        games: [
          { appid: 1, first_playtime: 1_700_000_000, playtime_forever: 10 },
          { appid: 1, first_playtime: 1_600_000_000 },
          { appid: 2 },
        ],
      },
    }),
  );
  const result = await fetchLastPlayedData(transport, FAKE_API_KEY, {
    now: new Date('2026-11-01T00:00:00.000Z'),
  });
  assert.equal(result.meta.rawCount, 3);
  assert.equal(result.meta.fetchedAt, '2026-11-01T00:00:00.000Z');
  assert.equal(result.meta.source, 'steam-client-get-last-played-times');
  assert.equal(result.meta.timezone, 'Asia/Shanghai');
  assert.equal(result.meta.minLastPlayed, null);
  assert.equal(result.games.length, 2);
  assert.equal(result.stats.duplicateCount, 1);
  assert.equal(result.stats.rejectedCount, 0);
  assert.ok(result.rawBody !== null);
});

test('fetch rejects an empty response without games field', async () => {
  const transport = makeTransport(async () => jsonResponse({ response: {} }));
  await assert.rejects(
    () => fetchLastPlayedData(transport, FAKE_API_KEY),
    (err: unknown) => err instanceof AppError && err.category === 'validation',
  );
});

test('fetch passes min_last_played through for incremental mode', async () => {
  let capturedUrl = '';
  const transport = makeTransport(async (url) => {
    capturedUrl = url;
    return jsonResponse({ response: { games: [] } });
  });
  await fetchLastPlayedData(transport, FAKE_API_KEY, { minLastPlayed: 1_700_000_000 });
  const parsed = new URL(capturedUrl);
  assert.equal(parsed.searchParams.get('min_last_played'), '1700000000');
});
