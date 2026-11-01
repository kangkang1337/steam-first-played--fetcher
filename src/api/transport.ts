import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { AppError, redactUrl } from '../errors.ts';

export type FetchLike = (
  url: string,
  init: RequestInit & { dispatcher?: unknown },
) => Promise<Response>;

export interface TransportOptions {
  /** Explicit proxy URL. When set, the transport never silently falls back to direct. */
  proxyUrl?: string | null;
  /** Whole-request timeout (connect + headers + body). */
  timeoutMs?: number;
  /** Test seam: inject a fetch implementation. */
  fetchImpl?: FetchLike;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  bodyText: string;
  usedProxy: boolean;
}

function findErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function isTimeout(err: unknown, code: string | undefined): boolean {
  const name = (err as { name?: unknown } | null)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') return true;
  return (
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_BODY_TIMEOUT' ||
    code === 'ABORT_ERR'
  );
}

function classifyNetworkError(
  err: unknown,
  usedProxy: boolean,
  url: string,
  timeoutMs: number,
): AppError {
  const code = findErrorCode(err);
  const message = String((err as { message?: unknown } | null)?.message ?? '');
  const safeUrl = redactUrl(url);

  if (isTimeout(err, code)) {
    return new AppError('timeout', `请求超时（${timeoutMs}ms 内未完成）`, { code, url: safeUrl });
  }
  if (usedProxy && (code === 'ECONNREFUSED' || /proxy/i.test(message) || /tunneling/i.test(message))) {
    return new AppError('proxy-connection-failed', '代理连接失败：请检查 STEAM_HTTPS_PROXY 与代理进程', {
      code,
      url: safeUrl,
    });
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return new AppError('dns-network', 'DNS 解析失败：无法解析目标主机', { code, url: safeUrl });
  }
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EPIPE' || code === 'ENETUNREACH') {
    return new AppError('dns-network', '网络连接失败', { code, url: safeUrl });
  }
  return new AppError('dns-network', '网络请求失败', { code, url: safeUrl });
}

export class Transport {
  readonly usedProxy: boolean;
  private readonly proxyUrl: string | null;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly dispatcher: ProxyAgent | null;

  constructor(options: TransportOptions = {}) {
    this.proxyUrl = options.proxyUrl ?? null;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.usedProxy = Boolean(this.proxyUrl);

    if (options.fetchImpl) {
      this.fetchImpl = options.fetchImpl;
      this.dispatcher = null;
      return;
    }
    if (this.proxyUrl) {
      this.dispatcher = new ProxyAgent(this.proxyUrl);
      this.fetchImpl = undiciFetch as unknown as FetchLike;
    } else {
      this.dispatcher = null;
      this.fetchImpl = globalThis.fetch as unknown as FetchLike;
    }
  }

  async get(url: string): Promise<HttpResponse> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    const init = {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal,
      ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
    } as unknown as RequestInit & { dispatcher?: unknown };

    try {
      const response = await this.fetchImpl(url, init);
      const bodyText = await response.text();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        headers[name.toLowerCase()] = value;
      });
      return {
        status: response.status,
        ok: response.ok,
        headers,
        bodyText,
        usedProxy: this.usedProxy,
      };
    } catch (err) {
      throw classifyNetworkError(err, this.usedProxy, url, this.timeoutMs);
    }
  }

  async close(): Promise<void> {
    if (this.dispatcher) {
      await this.dispatcher.close().catch(() => undefined);
    }
  }
}
