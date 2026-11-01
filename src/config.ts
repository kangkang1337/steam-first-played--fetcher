import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppError } from './errors.ts';

export interface AppConfig {
  ownerId: string;
  apiKey: string;
  proxyUrl: string | null;
  envFilePath: string | null;
}

export interface LoadConfigOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

const OWNER_ID_RE = /^\d{17}$/;
const API_KEY_RE = /^[0-9a-f]{32}$/i;

/** Minimal .env parser: KEY=VALUE, # comments, optional single/double quotes. */
export function parseEnvFile(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) result[key] = value;
  }
  return result;
}

function validateProxy(proxyUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(proxyUrl);
  } catch {
    throw new AppError('config', 'STEAM_HTTPS_PROXY 不是合法的 URL（应为 http:// 或 https:// 代理地址）');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('config', 'STEAM_HTTPS_PROXY 只支持 http:// 或 https:// 代理');
  }
  if (!parsed.hostname) {
    throw new AppError('config', 'STEAM_HTTPS_PROXY 缺少主机名');
  }
  return proxyUrl;
}

export function validateConfig(values: {
  ownerId?: string;
  apiKey?: string;
  proxyUrl?: string;
  envFilePath?: string | null;
}): AppConfig {
  const ownerId = (values.ownerId ?? '').trim();
  const apiKey = (values.apiKey ?? '').trim();
  const proxyRaw = (values.proxyUrl ?? '').trim();

  if (!ownerId) throw new AppError('config', '缺少 STEAM_OWNER_ID，请在 .env.local 中填写 SteamID64');
  if (!OWNER_ID_RE.test(ownerId)) {
    throw new AppError('config', 'STEAM_OWNER_ID 必须是 17 位数字（SteamID64）');
  }
  if (!apiKey) throw new AppError('config', '缺少 STEAM_WEB_API_KEY，请在 .env.local 中填写 Steam Web API Key');
  if (!API_KEY_RE.test(apiKey)) {
    throw new AppError('config', 'STEAM_WEB_API_KEY 必须是 32 位十六进制字符串');
  }
  const proxyUrl = proxyRaw ? validateProxy(proxyRaw) : null;

  return {
    ownerId,
    apiKey,
    proxyUrl,
    envFilePath: values.envFilePath ?? null,
  };
}

/**
 * Loads config from the process environment first, then from `.env.local` in `cwd`.
 * Never reads other projects' env files.
 */
export function loadConfig(options: LoadConfigOptions = {}): AppConfig {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const envFilePath = resolve(cwd, '.env.local');

  let fileValues: Record<string, string> = {};
  let usedFile: string | null = null;
  if (existsSync(envFilePath)) {
    try {
      fileValues = parseEnvFile(readFileSync(envFilePath, 'utf8'));
      usedFile = envFilePath;
    } catch {
      throw new AppError('config', '读取 .env.local 失败（权限或编码问题）');
    }
  }

  const pick = (name: 'STEAM_OWNER_ID' | 'STEAM_WEB_API_KEY' | 'STEAM_HTTPS_PROXY'): string | undefined =>
    env[name] ?? fileValues[name];

  return validateConfig({
    ownerId: pick('STEAM_OWNER_ID'),
    apiKey: pick('STEAM_WEB_API_KEY'),
    proxyUrl: pick('STEAM_HTTPS_PROXY'),
    envFilePath: usedFile,
  });
}
