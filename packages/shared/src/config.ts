import { DEFAULT_FRESHNESS_CONFIG, type FreshnessConfig, type ProviderId } from '@openbahia/transit-core';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface AppConfig {
  port: number;
  host: string;
  provider: ProviderId;
  realtimeRefreshMs: number;
  realtimeIdleTtlMs: number;
  realtimeMaxActiveLines: number;
  realtimeMaxConcurrentRequests: number;
  freshness: FreshnessConfig;
  publicApiUrl: string;
  gpsbahiaBaseUrl: string;
  gpsbusDatabaseUrl: string;
  gpsbusCityKey: string;
  userAgent: string;
  staticCacheDir: string;
  debugEndpoints: boolean;
}

function readOptionalNumber(
  name: string,
  fallback: number,
  env: NodeJS.ProcessEnv,
  min: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min) {
    throw new ConfigError(`${name} must be a number >= ${min} (got ${JSON.stringify(raw)})`);
  }
  return value;
}

function readBoolean(name: string, fallback: boolean, env: NodeJS.ProcessEnv): boolean {
  const raw = env[name];
  if (!raw) {
    return fallback;
  }
  switch (raw.toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
      return true;
    case '0':
    case 'false':
    case 'no':
      return false;
    default:
      throw new ConfigError(`${name} must be true or false (got ${JSON.stringify(raw)})`);
  }
}

function readProvider(value: string | undefined): ProviderId {
  switch (value) {
    case undefined:
    case '':
      return 'gpsbahia';
    case 'gpsbahia':
    case 'gpsbus':
    case 'mock':
      return value;
    default:
      throw new ConfigError(
        `TRANSIT_PROVIDER must be gpsbahia, gpsbus, or mock (got ${JSON.stringify(value)})`,
      );
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const liveAfterMs = readOptionalNumber('LIVE_AFTER_MS', DEFAULT_FRESHNESS_CONFIG.liveAfterMs, env, 1);
  const staleAfterMs = readOptionalNumber(
    'STALE_AFTER_MS',
    DEFAULT_FRESHNESS_CONFIG.staleAfterMs,
    env,
    1,
  );
  const veryStaleAfterMs = readOptionalNumber('VERY_STALE_AFTER_MS', staleAfterMs, env, 1);
  const vehicleVisibleMaxAgeMs = readOptionalNumber(
    'VEHICLE_VISIBLE_MAX_AGE_MS',
    DEFAULT_FRESHNESS_CONFIG.vehicleVisibleMaxAgeMs ?? 120_000,
    env,
    1,
  );
  if (staleAfterMs < liveAfterMs) {
    throw new ConfigError('STALE_AFTER_MS must be >= LIVE_AFTER_MS');
  }
  if (veryStaleAfterMs < staleAfterMs) {
    throw new ConfigError('VERY_STALE_AFTER_MS must be >= STALE_AFTER_MS');
  }
  return {
    port: readOptionalNumber('PORT', 3000, env, 1),
    host: env.HOST ?? '127.0.0.1',
    provider: readProvider(env.TRANSIT_PROVIDER),
    realtimeRefreshMs: readOptionalNumber('REALTIME_REFRESH_MS', 5_000, env, 1_000),
    realtimeIdleTtlMs: readOptionalNumber('REALTIME_IDLE_TTL_MS', 120_000, env, 1_000),
    realtimeMaxActiveLines: Math.floor(readOptionalNumber('REALTIME_MAX_ACTIVE_LINES', 8, env, 1)),
    realtimeMaxConcurrentRequests: Math.floor(
      readOptionalNumber('REALTIME_MAX_CONCURRENT_REQUESTS', 2, env, 1),
    ),
    freshness: {
      liveAfterMs,
      staleAfterMs,
      veryStaleAfterMs,
      vehicleVisibleMaxAgeMs,
    },
    publicApiUrl: env.PUBLIC_API_URL ?? 'http://localhost:3000',
    gpsbahiaBaseUrl: env.GPSBAHIA_BASE_URL ?? 'https://www.gpsbahia.com.ar/',
    gpsbusDatabaseUrl:
      env.GPSBUS_DATABASE_URL ?? 'https://gps-bus-7811f-default-rtdb.firebaseio.com',
    gpsbusCityKey: env.GPSBUS_CITY_KEY ?? 'bhi',
    userAgent:
      env.HTTP_USER_AGENT ??
      'OpenBahiaTransit/0.1 (https://github.com/openbahia; public-transit-map; conservative-client)',
    staticCacheDir: env.STATIC_CACHE_DIR ?? 'data/cache',
    debugEndpoints: readBoolean('DEBUG_ENDPOINTS', false, env),
  };
}
