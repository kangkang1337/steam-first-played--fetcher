import type { Transport } from './api/transport.ts';
import { requestLastPlayedTimes } from './api/steam-client.ts';
import { parseApiResponse } from './parser/response-parser.ts';

export interface ProbeResult {
  httpStatus: number;
  usedProxy: boolean;
  elapsedMs: number;
  responsePresent: boolean;
  gamesPresent: boolean;
  gamesCount: number;
  withFirstPlaytime: number;
  minFirstPlaytime: number | null;
  maxFirstPlaytime: number | null;
  looksLikeUnixSeconds: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Runs exactly one request and reports whether the HTTP Web API is usable. */
export async function probeApi(transport: Transport, apiKey: string): Promise<ProbeResult> {
  const startedAt = Date.now();
  const http = await requestLastPlayedTimes(transport, apiKey);
  const parsed = parseApiResponse(http);
  const games = parsed.games;
  const withFirstPlaytime = games.filter(
    (game) => isRecord(game) && game.first_playtime !== undefined,
  ).length;
  const firstValues = games
    .map((game) => (isRecord(game) ? game.first_playtime : undefined))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const minFirstPlaytime = firstValues.length > 0 ? Math.min(...firstValues) : null;
  const maxFirstPlaytime = firstValues.length > 0 ? Math.max(...firstValues) : null;

  return {
    httpStatus: http.status,
    usedProxy: http.usedProxy,
    elapsedMs: Date.now() - startedAt,
    responsePresent: parsed.responsePresent,
    gamesPresent: parsed.gamesPresent,
    gamesCount: games.length,
    withFirstPlaytime,
    minFirstPlaytime,
    maxFirstPlaytime,
    looksLikeUnixSeconds:
      minFirstPlaytime !== null &&
      maxFirstPlaytime !== null &&
      minFirstPlaytime >= 1_000_000_000 &&
      maxFirstPlaytime < 100_000_000_000,
  };
}
