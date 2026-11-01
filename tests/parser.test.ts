import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppError } from '../src/errors.ts';
import { assertHttpOk, parseApiResponse } from '../src/parser/response-parser.ts';
import { mockResponse } from './helpers.ts';

function expectCategory(fn: () => unknown, category: string): void {
  assert.throws(fn, (err: unknown) => err instanceof AppError && err.category === category);
}

test('parses a normal games response', () => {
  const parsed = parseApiResponse(
    mockResponse(200, JSON.stringify({ response: { games: [{ appid: 1 }, { appid: 2 }] } })),
  );
  assert.equal(parsed.gamesPresent, true);
  assert.equal(parsed.responsePresent, true);
  assert.equal(parsed.games.length, 2);
});

test('empty response object is valid but has no games', () => {
  const parsed = parseApiResponse(mockResponse(200, '{"response":{}}'));
  assert.equal(parsed.gamesPresent, false);
  assert.equal(parsed.games.length, 0);
});

test('invalid JSON throws parse-error', () => {
  expectCategory(() => parseApiResponse(mockResponse(200, '<html>oops</html>')), 'parse-error');
});

test('root array throws parse-error', () => {
  expectCategory(() => parseApiResponse(mockResponse(200, '[]')), 'parse-error');
});

test('missing response field throws parse-error', () => {
  expectCategory(() => parseApiResponse(mockResponse(200, '{"games":[]}')), 'parse-error');
});

test('response that is not an object throws parse-error', () => {
  expectCategory(() => parseApiResponse(mockResponse(200, '{"response":[]}')), 'parse-error');
});

test('games that is not an array throws parse-error', () => {
  expectCategory(() => parseApiResponse(mockResponse(200, '{"response":{"games":{}}}')), 'parse-error');
});

test('HTTP 405 is an http-status error', () => {
  expectCategory(
    () => parseApiResponse(mockResponse(405, 'This API must be called with a HTTP GET request')),
    'http-status',
  );
});

test('HTTP 403 is an api-rejected error', () => {
  expectCategory(() => assertHttpOk(mockResponse(403, 'Access is denied')), 'api-rejected');
});

test('x-eresult other than 1 is an api-rejected error', () => {
  expectCategory(
    () => assertHttpOk(mockResponse(200, '{"response":{}}', { 'x-eresult': '2' })),
    'api-rejected',
  );
});

test('x-eresult 1 is accepted', () => {
  assert.doesNotThrow(() => assertHttpOk(mockResponse(200, '{"response":{}}', { 'x-eresult': '1' })));
});

test('HTTP error body is truncated in details and redacted', () => {
  const body = `error key=${'a'.repeat(32)} ${'x'.repeat(1000)}`;
  try {
    assertHttpOk(mockResponse(500, body));
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err instanceof AppError);
    const text = String(err.details.body);
    assert.ok(text.length <= 300);
    assert.ok(!text.includes('a'.repeat(32)));
  }
});
