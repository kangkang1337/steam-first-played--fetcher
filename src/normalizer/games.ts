import { classifyTimestamp } from '../parser/timestamp.ts';
import type {
  NormalizedGame,
  NormalizeResult,
  PlatformCandidate,
  PlatformName,
} from '../types.ts';

const PLATFORM_FIELDS: ReadonlyArray<{ field: string; platform: PlatformName }> = [
  { field: 'first_windows_playtime', platform: 'windows' },
  { field: 'first_mac_playtime', platform: 'mac' },
  { field: 'first_linux_playtime', platform: 'linux' },
  { field: 'first_deck_playtime', platform: 'deck' },
];

const NUMERIC_FIELDS = [
  'last_playtime',
  'playtime_2weeks',
  'playtime_forever',
  'playtime_windows_forever',
  'playtime_mac_forever',
  'playtime_linux_forever',
  'last_windows_playtime',
  'last_mac_playtime',
  'last_linux_playtime',
] as const;

export interface NormalizeOptions {
  nowUnix?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validAppId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2_147_483_647;
}

export function normalizeGames(rawGames: unknown[], options: NormalizeOptions = {}): NormalizeResult {
  const byAppId = new Map<number, NormalizedGame>();
  let duplicateCount = 0;
  let fieldTypeErrorCount = 0;
  const rejected: Array<{ reason: string; raw: unknown }> = [];

  for (const raw of rawGames) {
    if (!isRecord(raw)) {
      rejected.push({ reason: 'not-an-object', raw });
      continue;
    }
    if (!validAppId(raw.appid)) {
      rejected.push({ reason: 'invalid-appid', raw });
      continue;
    }
    const appId = raw.appid;

    const issues: string[] = [];
    const numeric: Record<string, number | null> = {};
    for (const field of NUMERIC_FIELDS) {
      const value = raw[field];
      if (value === undefined || value === null) {
        numeric[field] = null;
        continue;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        fieldTypeErrorCount += 1;
        issues.push(`field-type-error:${field}`);
        numeric[field] = null;
        continue;
      }
      numeric[field] = value;
    }

    const firstResult = classifyTimestamp(raw.first_playtime, { nowUnix: options.nowUnix });
    if (firstResult.status !== 'valid') {
      issues.push(`first_playtime:${firstResult.status}`);
    }

    const platformTimestamps: Array<{ platform: PlatformName; unix: number; date: string }> = [];
    for (const { field, platform } of PLATFORM_FIELDS) {
      const result = classifyTimestamp(raw[field], { nowUnix: options.nowUnix });
      if (result.status === 'valid' && result.unix !== null && result.date !== null) {
        platformTimestamps.push({ platform, unix: result.unix, date: result.date });
      } else if (result.status !== 'missing') {
        issues.push(`${field}:${result.status}`);
      }
    }

    const firstValid = firstResult.status === 'valid';
    let platformCandidate: PlatformCandidate | null = null;
    if (!firstValid && platformTimestamps.length > 0) {
      platformTimestamps.sort((a, b) => a.unix - b.unix);
      const earliest = platformTimestamps[0];
      if (earliest) platformCandidate = earliest;
    }

    const confidence: NormalizedGame['confidence'] = firstValid
      ? 'confirmed'
      : platformCandidate
        ? 'platform-only'
        : firstResult.status === 'missing' || firstResult.status === 'zero'
          ? 'missing'
          : 'invalid';

    const game: NormalizedGame = {
      appId,
      gameName: null,
      firstPlaytime: firstValid ? firstResult.unix : null,
      firstPlayedOn: firstValid ? firstResult.date : null,
      datePrecision: firstValid ? 'day' : null,
      dateSource: firstValid ? 'steam' : platformCandidate ? 'platform-specific' : null,
      confidence,
      lastPlaytime: numeric.last_playtime ?? null,
      playtimeForever: numeric.playtime_forever ?? null,
      firstWindowsPlaytime: classifyTimestamp(raw.first_windows_playtime, {
        nowUnix: options.nowUnix,
      }).unix,
      firstMacPlaytime: classifyTimestamp(raw.first_mac_playtime, {
        nowUnix: options.nowUnix,
      }).unix,
      firstLinuxPlaytime: classifyTimestamp(raw.first_linux_playtime, {
        nowUnix: options.nowUnix,
      }).unix,
      firstDeckPlaytime: classifyTimestamp(raw.first_deck_playtime, {
        nowUnix: options.nowUnix,
      }).unix,
      platformCandidate,
      issues,
      raw,
    };

    if (byAppId.has(appId)) {
      duplicateCount += 1;
      continue;
    }
    byAppId.set(appId, game);
  }

  return {
    games: [...byAppId.values()],
    duplicateCount,
    rejected,
    fieldTypeErrorCount,
  };
}
