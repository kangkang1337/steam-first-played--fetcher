import { readFileSync } from 'node:fs';
import { AppError } from '../errors.ts';
import type {
  FetchReport,
  LibraryMatch,
  NormalizedGame,
  ReportCounts,
  ReportDates,
  StoredFetch,
} from '../types.ts';

export interface ReportExtras {
  returnedGames: number;
  duplicateCount: number;
  rejectedCount: number;
  fieldTypeErrors: number;
}

function firstPlayStatus(game: NormalizedGame): string {
  const issue = game.issues.find((item) => item.startsWith('first_playtime:'));
  return issue ? issue.slice('first_playtime:'.length) : 'valid';
}

export function computeCounts(games: NormalizedGame[], extras: ReportExtras): ReportCounts {
  let confirmed = 0;
  let missing = 0;
  let zero = 0;
  let invalid = 0;
  let platformOnly = 0;
  let noInfo = 0;
  let invalidTimestamps = 0;

  for (const game of games) {
    const status = firstPlayStatus(game);
    if (game.confidence === 'confirmed') {
      confirmed += 1;
    } else if (game.confidence === 'platform-only') {
      platformOnly += 1;
    } else {
      noInfo += 1;
    }
    if (status === 'missing') missing += 1;
    else if (status === 'zero') zero += 1;
    else if (status !== 'valid') {
      invalid += 1;
      invalidTimestamps += 1;
    }
  }

  return {
    returnedGames: extras.returnedGames,
    validAppIds: games.length,
    confirmedFirstPlaytime: confirmed,
    missingFirstPlaytime: missing,
    zeroFirstPlaytime: zero,
    invalidFirstPlaytime: invalid,
    platformOnly,
    noFirstPlayInfo: noInfo,
    duplicateAppIds: extras.duplicateCount,
    invalidTimestampCount: invalidTimestamps,
    rejectedRecords: extras.rejectedCount,
    fieldTypeErrors: extras.fieldTypeErrors,
  };
}

export function computeDates(games: NormalizedGame[]): ReportDates {
  const dates = games
    .filter((game) => game.confidence === 'confirmed' && game.firstPlayedOn)
    .map((game) => game.firstPlayedOn as string)
    .sort();
  return {
    earliestFirstPlayedOn: dates[0] ?? null,
    latestFirstPlayedOn: dates[dates.length - 1] ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extracts AppIds from a BAKA AWARD archive JSON. Only AppIds are used; no fuzzy matching. */
export function extractLibraryAppIds(json: unknown): { appIds: Set<number>; warnings: string[] } {
  const warnings: string[] = [];
  const candidates: unknown[] = [];

  if (Array.isArray(json)) {
    candidates.push(...json);
  } else if (isRecord(json)) {
    const keys = ['games', 'items', 'records', 'library', 'timeline'];
    for (const key of keys) {
      const value = json[key];
      if (Array.isArray(value)) {
        candidates.push(...value);
        break;
      }
    }
    if (candidates.length === 0) {
      warnings.push('未找到数组字段（尝试过 games/items/records/library/timeline）');
    }
  } else {
    warnings.push('档案 JSON 根节点不是数组或对象');
  }

  const appIds = new Set<number>();
  let skipped = 0;
  for (const item of candidates) {
    if (!isRecord(item)) {
      skipped += 1;
      continue;
    }
    const raw = item.appId ?? item.appid ?? item.app_id ?? item.steamAppId ?? item.steam_appid;
    if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
      appIds.add(raw);
    } else if (typeof raw === 'string' && /^\d+$/.test(raw)) {
      appIds.add(Number(raw));
    } else {
      skipped += 1;
    }
  }
  if (skipped > 0) warnings.push(`${skipped} 条记录没有可用 AppID，已跳过（不做模糊匹配）`);
  return { appIds, warnings };
}

export function loadLibraryAppIds(path: string): { appIds: Set<number>; warnings: string[] } {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new AppError('config', `无法读取档案文件：${path}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AppError('parse-error', `档案文件不是合法 JSON：${path}`);
  }
  return extractLibraryAppIds(json);
}

export function matchLibrary(
  games: NormalizedGame[],
  library: { appIds: Set<number>; warnings: string[] },
  path: string,
): LibraryMatch {
  const fetched = new Set(games.map((game) => game.appId));
  let matched = 0;
  const notInLibrary: number[] = [];
  for (const appId of fetched) {
    if (library.appIds.has(appId)) matched += 1;
    else notInLibrary.push(appId);
  }
  const missingFromFetched = [...library.appIds].filter((appId) => !fetched.has(appId)).sort((a, b) => a - b);
  return {
    provided: true,
    path,
    matched,
    unmatched: fetched.size - matched,
    notInLibrary: notInLibrary.sort((a, b) => a - b),
    missingFromFetched,
    parseWarnings: library.warnings,
  };
}

export function buildReport(
  stored: StoredFetch,
  extras: { duplicateCount: number; rejectedCount: number; fieldTypeErrors: number },
  library: LibraryMatch | null,
): FetchReport {
  return {
    version: 1,
    source: stored.meta.source,
    fetchedAt: stored.meta.fetchedAt,
    timezone: 'Asia/Shanghai',
    counts: computeCounts(stored.games, {
      returnedGames: stored.meta.rawCount,
      duplicateCount: extras.duplicateCount,
      rejectedCount: extras.rejectedCount,
      fieldTypeErrors: extras.fieldTypeErrors,
    }),
    dates: computeDates(stored.games),
    library,
  };
}

export function formatReport(report: FetchReport): string {
  const { counts, dates } = report;
  const lines: string[] = [
    'Steam 首次游玩数据统计（Asia/Shanghai）',
    `抓取时间: ${report.fetchedAt}`,
    `来源: ${report.source}`,
    '',
    `返回游戏数量: ${counts.returnedGames}`,
    `有效 AppID 数量: ${counts.validAppIds}`,
    `存在有效整体首次游玩时间: ${counts.confirmedFirstPlaytime}`,
    `缺失 first_playtime 字段: ${counts.missingFirstPlaytime}`,
    `first_playtime 为 0: ${counts.zeroFirstPlaytime}`,
    `first_playtime 非法/单位异常: ${counts.invalidFirstPlaytime}`,
    `仅有平台首次游玩时间: ${counts.platformOnly}`,
    `完全无首次游玩信息: ${counts.noFirstPlayInfo}`,
    `重复 AppID: ${counts.duplicateAppIds}`,
    `异常时间戳: ${counts.invalidTimestampCount}`,
    `无效 AppID 被丢弃: ${counts.rejectedRecords}`,
    `字段类型错误: ${counts.fieldTypeErrors}`,
    '',
    `最早首次游玩日期: ${dates.earliestFirstPlayedOn ?? '无'}`,
    `最晚首次游玩日期: ${dates.latestFirstPlayedOn ?? '无'}`,
  ];
  if (report.library) {
    lines.push(
      '',
      `BAKA 档案: ${report.library.path}`,
      `匹配数量: ${report.library.matched}`,
      `未匹配数量: ${report.library.unmatched}`,
      `档案缺少的 AppID 数量: ${report.library.missingFromFetched.length}`,
    );
    if (report.library.parseWarnings.length > 0) {
      lines.push(`解析提示: ${report.library.parseWarnings.join('；')}`);
    }
  }
  return lines.join('\n');
}
