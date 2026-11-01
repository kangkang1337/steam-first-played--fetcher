#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig, type AppConfig } from './config.ts';
import { AppError, redactSecrets } from './errors.ts';
import { Transport } from './api/transport.ts';
import { METHOD_NAME } from './parser/response-parser.ts';
import { probeApi } from './probe.ts';
import { fetchLastPlayedData } from './fetcher.ts';
import { buildReport, formatReport, loadLibraryAppIds, matchLibrary } from './reporter/summary.ts';
import { buildTimeline, writeJsonFile } from './exporter/json.ts';
import { writeMissingCsv, writeTimelineCsv } from './exporter/csv.ts';
import type { LibraryMatch, StoredFetch } from './types.ts';

const RAW_DIR = 'data/raw';
const LATEST_PATH = 'data/latest.json';
const EXPORTS_DIR = 'exports';

const STAGE_BY_CATEGORY: Record<string, string> = {
  config: '配置检查',
  'proxy-connection-failed': '传输（代理连接）',
  'dns-network': '传输（网络/DNS）',
  timeout: '传输（请求超时）',
  'http-status': 'HTTP 响应',
  'api-rejected': 'Steam API 拒绝',
  'parse-error': '响应解析',
  validation: '数据校验',
  'export-write': '导出写文件',
};

interface CliOptions {
  command: string;
  library?: string;
  minLastPlayed?: number;
  help: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { command: '', help: false };
  const takeValue = (index: number, name: string): string => {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new AppError('config', `参数 ${name} 缺少取值`);
    }
    return value;
  };
  const parseNonNegativeInt = (raw: string): number => {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      throw new AppError('config', '--min-last-played 必须是非负整数（Unix 秒）');
    }
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--library') {
      options.library = takeValue(index, '--library');
      index += 1;
    } else if (arg.startsWith('--library=')) {
      options.library = arg.slice('--library='.length);
    } else if (arg === '--min-last-played') {
      options.minLastPlayed = parseNonNegativeInt(takeValue(index, '--min-last-played'));
      index += 1;
    } else if (arg.startsWith('--min-last-played=')) {
      options.minLastPlayed = parseNonNegativeInt(arg.slice('--min-last-played='.length));
    } else if (arg.startsWith('-')) {
      throw new AppError('config', `未知参数：${arg}`);
    } else if (!options.command) {
      options.command = arg;
    } else {
      throw new AppError('config', `多余的位置参数：${arg}`);
    }
  }
  return options;
}

function printHelp(): void {
  console.log(`Steam First Play Fetcher

用法:
  npm run probe                         只发一次请求验证 ClientGetLastPlayedTimes，不落盘
  npm run fetch                         完整拉取并保存到 ${LATEST_PATH}
  npm run report [-- --library <path>]  打印统计报告
  npm run export [-- --library <path>]  生成 ${EXPORTS_DIR}/ 下的 JSON / CSV

选项:
  --library <path>        只读匹配 BAKA AWARD 档案 JSON（仅按 AppID）
  --min-last-played <N>   增量参数（Unix 秒），默认不传 = 全量
  --help, -h              显示帮助`);
}

function printError(err: unknown): void {
  if (err instanceof AppError) {
    const stage = STAGE_BY_CATEGORY[err.category] ?? err.category;
    console.error(`[失败] 阶段：${stage}（${err.category}）`);
    console.error(`原因：${err.message}`);
    if (Object.keys(err.details).length > 0) {
      console.error(`细节：${JSON.stringify(err.details)}`);
    }
    if (err.category === 'http-status' || err.category === 'api-rejected') {
      console.error(
        '提示：若该 HTTP 接口不可用，可检查 API Key 权限与「游戏详情」隐私设置；本项目不会自动尝试 Steam 客户端内部认证。',
      );
    }
  } else {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[失败] 未分类错误：${redactSecrets(message)}`);
  }
}

async function runProbe(): Promise<number> {
  let config: AppConfig;
  try {
    config = loadConfig();
  } catch (err) {
    printError(err);
    return 1;
  }

  const transport = new Transport({ proxyUrl: config.proxyUrl, timeoutMs: 20_000 });
  try {
    const result = await probeApi(transport, config.apiKey);
    console.log('探测结果：接口可用');
    console.log(`接口：${METHOD_NAME}`);
    console.log(`HTTP：${result.httpStatus}`);
    console.log(`传输：${result.usedProxy ? '代理' : '直连'}`);
    console.log(`耗时：${result.elapsedMs}ms`);
    console.log(
      `响应结构：response=${result.responsePresent ? '存在' : '缺失'}，games=${
        result.gamesPresent ? `数组（${result.gamesCount} 条）` : '缺失'
      }`,
    );
    console.log(`首次游玩字段：${result.withFirstPlaytime}/${result.gamesCount} 条包含 first_playtime`);
    if (result.minFirstPlaytime !== null && result.maxFirstPlaytime !== null) {
      console.log(
        `first_playtime 数值范围：${result.minFirstPlaytime} ~ ${result.maxFirstPlaytime}（${
          result.looksLikeUnixSeconds ? '符合 Unix 秒' : '不符合 Unix 秒，需复核'
        }）`,
      );
    }
    if (result.gamesCount === 0) {
      console.log(
        '注意：返回 0 条游戏。可能原因：API Key 无权限、游戏详情隐私未公开、该接口仅限客户端会话，或返回空 response。',
      );
      return 2;
    }
    return 0;
  } catch (err) {
    printError(err);
    return 1;
  } finally {
    await transport.close();
  }
}

async function runFetch(options: CliOptions): Promise<number> {
  let config: AppConfig;
  try {
    config = loadConfig();
  } catch (err) {
    printError(err);
    return 1;
  }

  const transport = new Transport({ proxyUrl: config.proxyUrl, timeoutMs: 60_000 });
  try {
    const result = await fetchLastPlayedData(transport, config.apiKey, {
      minLastPlayed: options.minLastPlayed ?? null,
    });
    const rawPath = `${RAW_DIR}/last-played-${result.meta.fetchedAt.replace(/[:.]/g, '-')}.json`;
    await writeJsonFile(rawPath, { meta: result.meta, body: result.rawBody });
    await writeJsonFile(LATEST_PATH, { meta: result.meta, games: result.games, stats: result.stats });

    console.log('拉取完成');
    console.log(`HTTP：${result.meta.httpStatus}，传输：${result.meta.usedProxy ? '代理' : '直连'}`);
    console.log(`返回记录：${result.meta.rawCount}，有效/去重后：${result.games.length}`);
    console.log(`重复 AppID：${result.stats.duplicateCount}，丢弃记录：${result.stats.rejectedCount}`);
    console.log(`原始数据：${rawPath}`);
    console.log(`归一化数据：${LATEST_PATH}`);
    console.log('下一步：npm run report / npm run export');
    return 0;
  } catch (err) {
    printError(err);
    return 1;
  } finally {
    await transport.close();
  }
}

async function readStored(): Promise<StoredFetch> {
  let text: string;
  try {
    text = await readFile(LATEST_PATH, 'utf8');
  } catch {
    throw new AppError('validation', `未找到 ${LATEST_PATH}，请先运行 npm run fetch`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AppError('parse-error', `${LATEST_PATH} 不是合法 JSON`);
  }
  if (!isRecord(json) || !isRecord(json.meta) || !Array.isArray(json.games)) {
    throw new AppError('validation', `${LATEST_PATH} 结构异常，请重新运行 fetch`);
  }
  const rawStats = isRecord(json.stats) ? json.stats : {};
  const stats = {
    duplicateCount: typeof rawStats.duplicateCount === 'number' ? rawStats.duplicateCount : 0,
    rejectedCount: typeof rawStats.rejectedCount === 'number' ? rawStats.rejectedCount : 0,
    fieldTypeErrors: typeof rawStats.fieldTypeErrors === 'number' ? rawStats.fieldTypeErrors : 0,
  };
  return { ...(json as unknown as StoredFetch), stats };
}

function loadLibrary(options: CliOptions, stored: StoredFetch): LibraryMatch | null {
  if (!options.library) return null;
  const path = resolve(options.library);
  const library = loadLibraryAppIds(path);
  return matchLibrary(stored.games, library, path);
}

async function runReport(options: CliOptions): Promise<number> {
  const stored = await readStored();
  const library = loadLibrary(options, stored);
  const report = buildReport(stored, stored.stats, library);
  console.log(formatReport(report));
  return 0;
}

async function runExport(options: CliOptions): Promise<number> {
  const stored = await readStored();
  const library = loadLibrary(options, stored);
  const report = buildReport(stored, stored.stats, library);
  const timeline = buildTimeline(stored);

  await writeJsonFile(`${EXPORTS_DIR}/first-play-timeline.json`, timeline);
  await writeTimelineCsv(`${EXPORTS_DIR}/first-play-timeline.csv`, stored.games);
  await writeMissingCsv(`${EXPORTS_DIR}/first-play-missing.csv`, stored.games);
  await writeJsonFile(`${EXPORTS_DIR}/fetch-report.json`, report);

  console.log('导出完成');
  console.log(`${EXPORTS_DIR}/first-play-timeline.json`);
  console.log(`${EXPORTS_DIR}/first-play-timeline.csv`);
  console.log(`${EXPORTS_DIR}/first-play-missing.csv`);
  console.log(`${EXPORTS_DIR}/fetch-report.json`);
  console.log(
    `确认日期：${report.counts.confirmedFirstPlaytime}，缺失/无效：${report.counts.noFirstPlayInfo}，仅平台：${report.counts.platformOnly}`,
  );
  return 0;
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.command) {
    printHelp();
    return options.help ? 0 : 1;
  }
  switch (options.command) {
    case 'probe':
      return runProbe();
    case 'fetch':
      return runFetch(options);
    case 'report':
      return runReport(options);
    case 'export':
      return runExport(options);
    default:
      throw new AppError('config', `未知命令：${options.command}`);
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    printError(err);
    process.exitCode = 1;
  });
