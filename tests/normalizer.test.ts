import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeGames } from '../src/normalizer/games.ts';
import { toShanghaiDate } from '../src/parser/timestamp.ts';

const NOW = 1_800_000_000;

test('valid overall first_playtime becomes a confirmed Steam date', () => {
  const result = normalizeGames(
    [{ appid: 524220, first_playtime: 1_700_000_000, last_playtime: 1_790_000_000, playtime_forever: 1000 }],
    { nowUnix: NOW },
  );
  assert.equal(result.games.length, 1);
  const game = result.games[0]!;
  assert.equal(game.appId, 524220);
  assert.equal(game.firstPlaytime, 1_700_000_000);
  assert.equal(game.firstPlayedOn, '2023-11-15');
  assert.equal(game.dateSource, 'steam');
  assert.equal(game.confidence, 'confirmed');
  assert.equal(game.playtimeForever, 1000);
  assert.equal(game.lastPlaytime, 1_790_000_000);
});

test('missing first_playtime is marked missing without fabricating a date', () => {
  const result = normalizeGames([{ appid: 10 }], { nowUnix: NOW });
  const game = result.games[0]!;
  assert.equal(game.firstPlaytime, null);
  assert.equal(game.firstPlayedOn, null);
  assert.equal(game.confidence, 'missing');
  assert.ok(game.issues.includes('first_playtime:missing'));
});

test('first_playtime of 0 is marked zero, not a date', () => {
  const result = normalizeGames([{ appid: 11, first_playtime: 0 }], { nowUnix: NOW });
  const game = result.games[0]!;
  assert.equal(game.firstPlaytime, null);
  assert.equal(game.firstPlayedOn, null);
  assert.equal(game.confidence, 'missing');
  assert.ok(game.issues.includes('first_playtime:zero'));
});

test('platform-specific dates only become a candidate', () => {
  const result = normalizeGames(
    [{ appid: 12, first_windows_playtime: 1_600_000_000, first_mac_playtime: 1_610_000_000 }],
    { nowUnix: NOW },
  );
  const game = result.games[0]!;
  assert.equal(game.firstPlayedOn, null);
  assert.equal(game.dateSource, 'platform-specific');
  assert.equal(game.confidence, 'platform-only');
  assert.equal(game.platformCandidate?.platform, 'windows');
  assert.equal(game.platformCandidate?.unix, 1_600_000_000);
  assert.equal(game.platformCandidate?.date, toShanghaiDate(1_600_000_000));
});

test('platform fields never override a valid overall first_playtime', () => {
  const result = normalizeGames(
    [{ appid: 13, first_playtime: 1_700_000_000, first_windows_playtime: 1_600_000_000 }],
    { nowUnix: NOW },
  );
  const game = result.games[0]!;
  assert.equal(game.dateSource, 'steam');
  assert.equal(game.firstPlayedOn, '2023-11-15');
  assert.equal(game.platformCandidate, null);
});

test('duplicate AppIds are de-duplicated and counted', () => {
  const result = normalizeGames(
    [
      { appid: 14, first_playtime: 1_700_000_000 },
      { appid: 14, first_playtime: 1_600_000_000 },
    ],
    { nowUnix: NOW },
  );
  assert.equal(result.games.length, 1);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.games[0]!.firstPlaytime, 1_700_000_000);
});

test('invalid AppIds are rejected while valid records survive', () => {
  const result = normalizeGames(
    [{ appid: '15' }, { appid: 0 }, { appid: -5 }, { appid: 1.5 }, { appid: 2_147_483_648 }, null, 'x', { appid: 16 }],
    { nowUnix: NOW },
  );
  assert.equal(result.games.length, 1);
  assert.equal(result.games[0]!.appId, 16);
  assert.equal(result.rejected.length, 7);
});

test('wrong field types are reported and do not abort other records', () => {
  const result = normalizeGames(
    [{ appid: 17, playtime_forever: '100', first_playtime: 1_700_000_000 }],
    { nowUnix: NOW },
  );
  assert.equal(result.fieldTypeErrorCount, 1);
  const game = result.games[0]!;
  assert.ok(game.issues.includes('field-type-error:playtime_forever'));
  assert.equal(game.playtimeForever, null);
  assert.equal(game.firstPlayedOn, '2023-11-15');
});

test('invalid platform timestamp is reported but ignored', () => {
  const result = normalizeGames(
    [{ appid: 18, first_playtime: 1_700_000_000, first_windows_playtime: -1 }],
    { nowUnix: NOW },
  );
  const game = result.games[0]!;
  assert.ok(game.issues.includes('first_windows_playtime:negative'));
  assert.equal(game.firstWindowsPlaytime, null);
});

test('unit-anomaly overall timestamp yields invalid confidence and no date', () => {
  const result = normalizeGames([{ appid: 19, first_playtime: 1_700_000_000_000 }], { nowUnix: NOW });
  const game = result.games[0]!;
  assert.equal(game.confidence, 'invalid');
  assert.equal(game.firstPlayedOn, null);
  assert.ok(game.issues.includes('first_playtime:unit-anomaly'));
});

test('missing deck field stays null and is not invented', () => {
  const result = normalizeGames([{ appid: 20, first_playtime: 1_700_000_000 }], { nowUnix: NOW });
  const game = result.games[0]!;
  assert.equal(game.firstDeckPlaytime, null);
});

test('zero overall plus platform timestamp yields platform-only', () => {
  const result = normalizeGames(
    [{ appid: 21, first_playtime: 0, first_linux_playtime: 1_600_000_000 }],
    { nowUnix: NOW },
  );
  const game = result.games[0]!;
  assert.equal(game.confidence, 'platform-only');
  assert.equal(game.platformCandidate?.platform, 'linux');
});
