import type { FetchLike, Transport } from '../src/api/transport.ts';
import { Transport as TransportClass } from '../src/api/transport.ts';

export const FAKE_API_KEY = '0123456789abcdef0123456789abcdef';
export const FAKE_OWNER_ID = '76561198000000000';
export const NOW_UNIX = 1_800_000_000; // 2027-01-15, keeps fixtures stable

export function mockResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Response & { bodyText: string } {
  const lower: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) lower[key.toLowerCase()] = value;
  const headerObject = {
    ...lower,
    forEach(callback: (value: string, key: string) => void) {
      for (const [key, value] of Object.entries(lower)) callback(value, key);
    },
  };
  return {
    status,
    ok: status >= 200 && status < 300,
    bodyText: body,
    headers: headerObject,
    text: async () => body,
  } as unknown as Response & { bodyText: string };
}

export function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return mockResponse(status, JSON.stringify(payload), {
    'content-type': 'application/json',
    ...headers,
  });
}

export function errorWithCode(code: string, name = 'Error'): Error {
  const error = new Error(`mock ${code}`);
  error.name = name;
  (error as Error & { code?: string }).code = code;
  return error;
}

export function makeTransport(
  handler: (url: string, init: RequestInit & { dispatcher?: unknown }) => Promise<Response>,
  options: { proxyUrl?: string | null; timeoutMs?: number } = {},
): Transport {
  return new TransportClass({
    proxyUrl: options.proxyUrl ?? null,
    timeoutMs: options.timeoutMs ?? 20_000,
    fetchImpl: handler as FetchLike,
  });
}

export function captureRequests(): {
  requests: Array<{ url: string; init: RequestInit & { dispatcher?: unknown } }>;
  handler: (response: Response) => (url: string, init: RequestInit & { dispatcher?: unknown }) => Promise<Response>;
} {
  const requests: Array<{ url: string; init: RequestInit & { dispatcher?: unknown } }> = [];
  const handler = (response: Response) => async (
    url: string,
    init: RequestInit & { dispatcher?: unknown },
  ): Promise<Response> => {
    requests.push({ url, init });
    return response;
  };
  return { requests, handler };
}
