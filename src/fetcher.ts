import type { Transport } from './api/transport.ts';
import { requestLastPlayedTimes } from './api/steam-client.ts';
import { AppError } from './errors.ts';
import { normalizeGames } from './normalizer/games.ts';
import { parseApiResponse } from './parser/response-parser.ts';
import type { FetchMeta, FetchStats, NormalizedGame } from './types.ts';

const SOURCE = 'steam-client-get-last-played-times';

export interface FetchResult {
  meta: FetchMeta;
  games: NormalizedGame[];
  stats: FetchStats;
  rawBody: unknown;
}

export interface FetchLastPlayedOptions {
  /** Omit for a full fetch; a value enables client-style incremental mode. */
  minLastPlayed?: number | null;
  /** Test seam for deterministic timestamps. */
  now?: Date;
}

export async function fetchLastPlayedData(
  transport: Transport,
  apiKey: string,
  options: FetchLastPlayedOptions = {},
): Promise<FetchResult> {
  const http = await requestLastPlayedTimes(transport, apiKey, {
    minLastPlayed: options.minLastPlayed ?? null,
  });
  const parsed = parseApiResponse(http);
  if (!parsed.gamesPresent) {
    throw new AppError('validation', '响应中没有 games 字段，接口可能被拒绝或返回空 response');
  }

  const normalized = normalizeGames(parsed.games);
  const fetchedAt = (options.now ?? new Date()).toISOString();
  const meta: FetchMeta = {
    fetchedAt,
    source: SOURCE,
    timezone: 'Asia/Shanghai',
    httpStatus: http.status,
    usedProxy: http.usedProxy,
    minLastPlayed: options.minLastPlayed ?? null,
    rawCount: parsed.games.length,
  };
  const stats: FetchStats = {
    duplicateCount: normalized.duplicateCount,
    rejectedCount: normalized.rejected.length,
    fieldTypeErrors: normalized.fieldTypeErrorCount,
  };

  let rawBody: unknown = null;
  try {
    rawBody = JSON.parse(http.bodyText);
  } catch {
    rawBody = null;
  }

  return { meta, games: normalized.games, stats, rawBody };
}
