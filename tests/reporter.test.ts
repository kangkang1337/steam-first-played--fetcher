import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeGames } from '../src/normalizer/games.ts';
import {
  buildReport,
  computeCounts,
  computeDates,
  extractLibraryAppIds,
  formatReport,
  matchLibrary,
} from '../src/reporter/summary.ts';
import type { StoredFetch } from '../src/types.ts';

const NOW = 1_800_000_000;

const normalized = normalizeGames(
  [
    { appid: 1, first_playtime: 1_700_000_000 },
    { appid: 2 },
    { appid: 3, first_playtime: 0 },
    { appid: 4, first_windows_playtime: 1_600_000_000 },
    { appid: 5, first_playtime: 1_600_000_000 },
  ],
  { nowUnix: NOW },
);

test('counts distinguish missing, zero, platform-only and confirmed', () => {
  const counts = computeCounts(normalized.games, {
    returnedGames: 5,
    duplicateCount: 0,
    rejectedCount: 0,
    fieldTypeErrors: 0,
  });
  assert.equal(counts.returnedGames, 5);
  assert.equal(counts.validAppIds, 5);
  assert.equal(counts.confirmedFirstPlaytime, 2);
  assert.equal(counts.missingFirstPlaytime, 2);
  assert.equal(counts.zeroFirstPlaytime, 1);
  assert.equal(counts.invalidFirstPlaytime, 0);
  assert.equal(counts.platformOnly, 1);
  assert.equal(counts.noFirstPlayInfo, 2);
});

test('dates only use confirmed games', () => {
  const dates = computeDates(normalized.games);
  assert.equal(dates.earliestFirstPlayedOn, '2020-09-13');
  assert.equal(dates.latestFirstPlayedOn, '2023-11-15');
});

test('library extraction supports arrays and object wrappers', () => {
  const fromArray = extractLibraryAppIds([{ appId: 1 }, { appid: '2' }, { name: 'no id' }]);
  assert.deepEqual([...fromArray.appIds].sort((a, b) => a - b), [1, 2]);
  assert.ok(fromArray.warnings.length > 0);

  const fromObject = extractLibraryAppIds({ games: [{ steam_appid: 3 }] });
  assert.deepEqual([...fromObject.appIds], [3]);
});

test('library matching uses AppIds only', () => {
  const library = extractLibraryAppIds({ games: [{ appId: 1 }, { appId: 9 }] });
  const match = matchLibrary(normalized.games, library, 'archive.json');
  assert.equal(match.matched, 1);
  assert.equal(match.unmatched, 4);
  assert.deepEqual(match.notInLibrary, [2, 3, 4, 5]);
  assert.deepEqual(match.missingFromFetched, [9]);
});

test('buildReport and formatReport expose the required counters', () => {
  const stored: StoredFetch = {
    meta: {
      fetchedAt: '2026-11-01T00:00:00.000Z',
      source: 'steam-client-get-last-played-times',
      timezone: 'Asia/Shanghai',
      httpStatus: 200,
      usedProxy: false,
      minLastPlayed: null,
      rawCount: 5,
    },
    games: normalized.games,
    stats: { duplicateCount: 0, rejectedCount: 0, fieldTypeErrors: 0 },
  };
  const report = buildReport(stored, stored.stats, null);
  const text = formatReport(report);
  assert.ok(text.includes('存在有效整体首次游玩时间: 2'));
  assert.ok(text.includes('缺失 first_playtime 字段: 2'));
  assert.ok(text.includes('最早首次游玩日期: 2020-09-13'));
  assert.ok(text.includes('最晚首次游玩日期: 2023-11-15'));
  assert.equal(report.counts.confirmedFirstPlaytime, 2);
});
