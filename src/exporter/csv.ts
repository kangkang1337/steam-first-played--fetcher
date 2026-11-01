import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { AppError } from '../errors.ts';
import type { NormalizedGame } from '../types.ts';

export const TIMELINE_HEADERS = [
  'appId',
  'gameName',
  'firstPlayedOn',
  'firstPlaytime',
  'datePrecision',
  'dateSource',
  'confidence',
  'isMissing',
  'platformCandidateDate',
  'platformCandidatePlatform',
  'firstWindowsPlaytime',
  'firstMacPlaytime',
  'firstLinuxPlaytime',
  'firstDeckPlaytime',
  'lastPlaytime',
  'playtimeForever',
  'issues',
] as const;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function joinRow(values: unknown[]): string {
  return values.map(csvEscape).join(',');
}

function gameRow(game: NormalizedGame): string {
  return joinRow([
    game.appId,
    game.gameName,
    game.firstPlayedOn,
    game.firstPlaytime,
    game.datePrecision,
    game.dateSource,
    game.confidence,
    game.confidence !== 'confirmed',
    game.platformCandidate?.date ?? null,
    game.platformCandidate?.platform ?? null,
    game.firstWindowsPlaytime,
    game.firstMacPlaytime,
    game.firstLinuxPlaytime,
    game.firstDeckPlaytime,
    game.lastPlaytime,
    game.playtimeForever,
    game.issues.join('; '),
  ]);
}

/** All records, including missing dates. Rows are never dropped for missing data. */
export function buildTimelineCsv(games: NormalizedGame[]): string {
  const rows = [joinRow([...TIMELINE_HEADERS]), ...games.map(gameRow)];
  return `${rows.join('\r\n')}\r\n`;
}

/** Only records without a confirmed overall date (missing / zero / invalid / platform-only). */
export function buildMissingCsv(games: NormalizedGame[]): string {
  const missing = games.filter((game) => game.confidence !== 'confirmed');
  const rows = [joinRow([...TIMELINE_HEADERS]), ...missing.map(gameRow)];
  return `${rows.join('\r\n')}\r\n`;
}

async function writeText(path: string, text: string): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `\uFEFF${text}`, 'utf8');
  } catch {
    throw new AppError('export-write', `写入文件失败：${path}`);
  }
}

export async function writeTimelineCsv(path: string, games: NormalizedGame[]): Promise<void> {
  await writeText(path, buildTimelineCsv(games));
}

export async function writeMissingCsv(path: string, games: NormalizedGame[]): Promise<void> {
  await writeText(path, buildMissingCsv(games));
}
