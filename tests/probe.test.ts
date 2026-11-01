import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppError } from '../src/errors.ts';
import { probeApi } from '../src/probe.ts';
import { FAKE_API_KEY, jsonResponse, makeTransport, mockResponse } from './helpers.ts';

test('probe reports counts and a plausible Unix-second range', async () => {
  const transport = makeTransport(async () =>
    jsonResponse({
      response: {
        games: [
          { appid: 1, first_playtime: 1_700_000_000 },
          { appid: 2, first_playtime: 1_600_000_000 },
          { appid: 3 },
        ],
      },
    }),
  );
  const result = await probeApi(transport, FAKE_API_KEY);
  assert.equal(result.httpStatus, 200);
  assert.equal(result.usedProxy, false);
  assert.equal(result.responsePresent, true);
  assert.equal(result.gamesPresent, true);
  assert.equal(result.gamesCount, 3);
  assert.equal(result.withFirstPlaytime, 2);
  assert.equal(result.minFirstPlaytime, 1_600_000_000);
  assert.equal(result.maxFirstPlaytime, 1_700_000_000);
  assert.equal(result.looksLikeUnixSeconds, true);
});

test('probe reports zero games without throwing', async () => {
  const transport = makeTransport(async () => jsonResponse({ response: {} }));
  const result = await probeApi(transport, FAKE_API_KEY);
  assert.equal(result.gamesCount, 0);
  assert.equal(result.gamesPresent, false);
  assert.equal(result.looksLikeUnixSeconds, false);
});

test('probe flags millisecond-looking values as not Unix seconds', async () => {
  const transport = makeTransport(async () =>
    jsonResponse({ response: { games: [{ appid: 1, first_playtime: 1_700_000_000_000 }] } }),
  );
  const result = await probeApi(transport, FAKE_API_KEY);
  assert.equal(result.looksLikeUnixSeconds, false);
});

test('probe surfaces HTTP errors with the right category', async () => {
  const transport = makeTransport(async () => mockResponse(500, 'boom'));
  await assert.rejects(
    () => probeApi(transport, FAKE_API_KEY),
    (err: unknown) => err instanceof AppError && err.category === 'http-status' && err.details.status === 500,
  );
});
