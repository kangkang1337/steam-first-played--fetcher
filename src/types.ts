export type TimestampStatus =
  | 'valid'
  | 'missing'
  | 'zero'
  | 'not-a-number'
  | 'not-integer'
  | 'negative'
  | 'unit-anomaly'
  | 'implausible-date';

export interface TimestampResult {
  status: TimestampStatus;
  /** Unix seconds, only when status === 'valid'. */
  unix: number | null;
  /** YYYY-MM-DD in Asia/Shanghai, only when status === 'valid'. */
  date: string | null;
}

export type Confidence = 'confirmed' | 'platform-only' | 'missing' | 'invalid';
export type DateSource = 'steam' | 'platform-specific';
export type PlatformName = 'windows' | 'mac' | 'linux' | 'deck';

export interface PlatformCandidate {
  platform: PlatformName;
  unix: number;
  date: string;
}

export interface NormalizedGame {
  appId: number;
  gameName: string | null;
  /** Raw overall first_playtime, null when the field is absent/0/invalid. */
  firstPlaytime: number | null;
  /** Confirmed overall date; null unless dateSource === 'steam'. */
  firstPlayedOn: string | null;
  datePrecision: 'day' | null;
  dateSource: DateSource | null;
  confidence: Confidence;
  lastPlaytime: number | null;
  playtimeForever: number | null;
  firstWindowsPlaytime: number | null;
  firstMacPlaytime: number | null;
  firstLinuxPlaytime: number | null;
  firstDeckPlaytime: number | null;
  /** Earliest valid platform-specific timestamp, only when overall first_playtime is unusable. */
  platformCandidate: PlatformCandidate | null;
  issues: string[];
  raw: Record<string, unknown>;
}

export interface NormalizeResult {
  games: NormalizedGame[];
  duplicateCount: number;
  rejected: Array<{ reason: string; raw: unknown }>;
  fieldTypeErrorCount: number;
}

export interface FetchMeta {
  fetchedAt: string;
  source: string;
  timezone: 'Asia/Shanghai';
  httpStatus: number;
  usedProxy: boolean;
  minLastPlayed: number | null;
  rawCount: number;
}

export interface FetchStats {
  duplicateCount: number;
  rejectedCount: number;
  fieldTypeErrors: number;
}

export interface StoredFetch {
  meta: FetchMeta;
  games: NormalizedGame[];
  stats: FetchStats;
}

export interface ReportCounts {
  returnedGames: number;
  validAppIds: number;
  confirmedFirstPlaytime: number;
  missingFirstPlaytime: number;
  zeroFirstPlaytime: number;
  invalidFirstPlaytime: number;
  platformOnly: number;
  noFirstPlayInfo: number;
  duplicateAppIds: number;
  invalidTimestampCount: number;
  rejectedRecords: number;
  fieldTypeErrors: number;
}

export interface ReportDates {
  earliestFirstPlayedOn: string | null;
  latestFirstPlayedOn: string | null;
}

export interface LibraryMatch {
  provided: boolean;
  path: string | null;
  matched: number;
  unmatched: number;
  /** AppIds present in the fetched data but absent from the library archive. */
  notInLibrary: number[];
  /** AppIds present in the library archive but absent from the fetched data. */
  missingFromFetched: number[];
  parseWarnings: string[];
}

export interface FetchReport {
  version: 1;
  source: string;
  fetchedAt: string;
  timezone: 'Asia/Shanghai';
  counts: ReportCounts;
  dates: ReportDates;
  library: LibraryMatch | null;
}
