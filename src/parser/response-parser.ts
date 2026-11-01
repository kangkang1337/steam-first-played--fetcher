import type { HttpResponse } from '../api/transport.ts';
import { AppError, redactSecrets } from '../errors.ts';

export const METHOD_NAME = 'IPlayerService/ClientGetLastPlayedTimes/v1';

export interface ParsedResponse {
  games: unknown[];
  responsePresent: boolean;
  gamesPresent: boolean;
  warnings: string[];
}

function preview(text: string): string {
  return redactSecrets(text).replace(/\s+/g, ' ').slice(0, 300);
}

export function assertHttpOk(http: HttpResponse): void {
  if (http.status < 200 || http.status >= 300) {
    if (http.status === 401 || http.status === 403) {
      throw new AppError('api-rejected', `${METHOD_NAME} 被 Steam 拒绝（HTTP ${http.status}）`, {
        status: http.status,
        body: preview(http.bodyText),
      });
    }
    throw new AppError('http-status', `${METHOD_NAME} 返回 HTTP ${http.status}`, {
      status: http.status,
      body: preview(http.bodyText),
    });
  }
  const xEresult = http.headers['x-eresult'];
  if (xEresult !== undefined && xEresult !== '1') {
    throw new AppError('api-rejected', `${METHOD_NAME} 返回错误码 x-eresult=${xEresult}`, {
      status: http.status,
      xEresult,
    });
  }
}

export function parseApiResponse(http: HttpResponse): ParsedResponse {
  assertHttpOk(http);

  let json: unknown;
  try {
    json = JSON.parse(http.bodyText);
  } catch {
    throw new AppError('parse-error', '响应不是合法 JSON', {
      status: http.status,
      preview: preview(http.bodyText),
    });
  }

  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new AppError('parse-error', '响应根节点不是 JSON 对象');
  }
  const root = json as Record<string, unknown>;
  if (!('response' in root)) {
    throw new AppError('parse-error', '响应缺少 response 字段', { keys: Object.keys(root) });
  }
  const response = root.response;
  if (typeof response !== 'object' || response === null || Array.isArray(response)) {
    throw new AppError('parse-error', 'response 字段不是对象');
  }

  const gamesValue = (response as Record<string, unknown>).games;
  if (gamesValue === undefined || gamesValue === null) {
    return { games: [], responsePresent: true, gamesPresent: false, warnings: [] };
  }
  if (!Array.isArray(gamesValue)) {
    throw new AppError('parse-error', 'response.games 不是数组');
  }
  return { games: gamesValue, responsePresent: true, gamesPresent: true, warnings: [] };
}
