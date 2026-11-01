export type ErrorCategory =
  | 'config'
  | 'proxy-connection-failed'
  | 'dns-network'
  | 'timeout'
  | 'http-status'
  | 'api-rejected'
  | 'parse-error'
  | 'validation'
  | 'export-write';

export class AppError extends Error {
  readonly category: ErrorCategory;
  readonly details: Record<string, unknown>;

  constructor(category: ErrorCategory, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AppError';
    this.category = category;
    this.details = details;
  }
}

/** Removes secrets (API key, token, password) from a URL before logging it. */
export function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const name of ['key', 'access_token', 'token', 'password', 'apikey']) {
      if (url.searchParams.has(name)) url.searchParams.set(name, 'REDACTED');
    }
    return url.toString();
  } catch {
    return rawUrl.replace(/([?&](?:key|access_token|token|password|apikey)=)[^&]*/gi, '$1REDACTED');
  }
}

/** Best-effort scrubbing of obvious secrets from free-form text. */
export function redactSecrets(text: string): string {
  return text
    .replace(/([?&](?:key|access_token|token|password|apikey)=)[^&\s"']+/gi, '$1REDACTED')
    .replace(/\b[0-9a-f]{32}\b/gi, 'REDACTED_KEY');
}
