import type { HttpResponse, Transport } from './transport.ts';

export const STEAM_API_HOST = 'https://api.steampowered.com';
export const CLIENT_GET_LAST_PLAYED_TIMES_PATH = '/IPlayerService/ClientGetLastPlayedTimes/v1/';

export interface RequestOptions {
  /** Omit for a full fetch (client semantics: "I know nothing yet"). */
  minLastPlayed?: number | null;
}

/**
 * Builds the Web API URL. GET is required by Steam: a POST returns HTTP 405
 * ("This API must be called with a HTTP GET request").
 */
export function buildLastPlayedTimesUrl(apiKey: string, minLastPlayed?: number | null): string {
  const url = new URL(CLIENT_GET_LAST_PLAYED_TIMES_PATH, STEAM_API_HOST);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('format', 'json');
  if (minLastPlayed !== undefined && minLastPlayed !== null) {
    url.searchParams.set('min_last_played', String(minLastPlayed));
  }
  return url.toString();
}

export async function requestLastPlayedTimes(
  transport: Transport,
  apiKey: string,
  options: RequestOptions = {},
): Promise<HttpResponse> {
  return transport.get(buildLastPlayedTimesUrl(apiKey, options.minLastPlayed));
}
