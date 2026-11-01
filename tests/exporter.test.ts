import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTimelineCsv, buildMissingCsv } from '../src/exporter/csv.ts';
import { buildTimeline } from '../src/exporter/json.ts';
import { normalizeGames } from '../src/normalizer/games.ts';
import type { StoredFetch } from '../src/types.ts';

const NOW = 1_800_000_000;
const normalized = normalizeGames(
  [
    { appid: 1, first_playtime: 1_700_000_000 },
    { appid: 2 },
    { appid: 3, first_playtime: 1_600_000_000 },
  ],
  { nowUnix: NOW },
);
const stored: StoredFetch = {
  meta: {
    fetchedAt: '2026-11-01T00:00:00.000Z',
    source: 'steam-client-get-last-played-times',
    timezone: 'Asia/Shanghai',
    httpStatus: 200,
    usedProxy: false,
    minLastPlayed: null,
    rawCount: 3,
  },
  games: normalized.games,
  stats: { duplicateCount: 0, rejectedCount: 0, fieldTypeErrors: 0 },
};

test('timeline JSON keeps every game and never exports raw records', () => {
  const timeline = buildTimeline(stored);
  assert.equal(timeline.version, 1);
  assert.equal(timeline.timezone, 'Asia/Shanghai');
  assert.equal(timeline.source, 'steam-client-get-last-played-times');
  assert.equal(timeline.games.length, 3);
  const text = JSON.stringify(timeline);
  assert.ok(!text.includes('"raw"'));
  const missing = timeline.games.find((game) => game.appId === 2)!;
  assert.equal(missing.firstPlayedOn, null);
  assert.equal(missing.dateSource, null);
  assert.equal(missing.confidence, 'missing');
});

test('timeline CSV keeps rows for missing dates', () => {
  const csv = buildTimelineCsv(normalized.games);
  const lines = csv.split('\r\n').filter((line) => line.length > 0);
  assert.equal(lines.length, 4);
  assert.ok(lines[0]!.startsWith('appId,gameName,firstPlayedOn'));
  assert.ok(csv.includes('2,,,'));
});

test('missing CSV only lists non-confirmed rows and keeps them', () => {
  const csv = buildMissingCsv(normalized.games);
  const lines = csv.split('\r\n').filter((line) => line.length > 0);
  assert.equal(lines.length, 2);
  assert.ok(csv.includes('2,,,'));
  assert.ok(!csv.includes('\r\n1,'));
});

test('CSV escapes commas, quotes and newlines', () => {
  const tricky = { ...normalized.games[0]!, gameName: 'A,"B"\nC' };
  const csv = buildTimelineCsv([tricky]);
  assert.ok(csv.includes('"A,""B""\nC"'));
});
