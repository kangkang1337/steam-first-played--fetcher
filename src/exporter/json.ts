import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { AppError } from '../errors.ts';
import type { FetchReport, NormalizedGame, StoredFetch } from '../types.ts';

export interface TimelineGame {
  appId: number;
  gameName: string | null;
  firstPlaytime: number | null;
  firstPlayedOn: string | null;
  datePrecision: 'day' | null;
  dateSource: 'steam' | 'platform-specific' | null;
  confidence: NormalizedGame['confidence'];
  lastPlaytime: number | null;
  playtimeForever: number | null;
  firstWindowsPlaytime: number | null;
  firstMacPlaytime: number | null;
  firstLinuxPlaytime: number | null;
  firstDeckPlaytime: number | null;
  platformCandidate: NormalizedGame['platformCandidate'];
  issues: string[];
}

export interface TimelineFile {
  version: 1;
  source: string;
  fetchedAt: string;
  timezone: 'Asia/Shanghai';
  games: TimelineGame[];
}

export function buildTimeline(stored: StoredFetch): TimelineFile {
  return {
    version: 1,
    source: stored.meta.source,
    fetchedAt: stored.meta.fetchedAt,
    timezone: 'Asia/Shanghai',
    games: stored.games.map((game) => ({
      appId: game.appId,
      gameName: game.gameName,
      firstPlaytime: game.firstPlaytime,
      firstPlayedOn: game.firstPlayedOn,
      datePrecision: game.datePrecision,
      dateSource: game.dateSource,
      confidence: game.confidence,
      lastPlaytime: game.lastPlaytime,
      playtimeForever: game.playtimeForever,
      firstWindowsPlaytime: game.firstWindowsPlaytime,
      firstMacPlaytime: game.firstMacPlaytime,
      firstLinuxPlaytime: game.firstLinuxPlaytime,
      firstDeckPlaytime: game.firstDeckPlaytime,
      platformCandidate: game.platformCandidate,
      issues: game.issues,
    })),
  };
}

export function buildFetchReportFile(report: FetchReport): FetchReport {
  return report;
}

export async function writeJsonFile(path: string, data: unknown): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  } catch {
    throw new AppError('export-write', `写入文件失败：${path}`);
  }
}

export async function writeTimelineJson(path: string, stored: StoredFetch): Promise<void> {
  await writeJsonFile(path, buildTimeline(stored));
}
