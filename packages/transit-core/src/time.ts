import { assertNever, type FreshnessConfig, type FreshnessLevel } from './types.js';

export const DEFAULT_VEHICLE_VISIBLE_MAX_AGE_MS = 120_000;

export const DEFAULT_FRESHNESS_CONFIG: FreshnessConfig = {
  liveAfterMs: 30_000,
  staleAfterMs: 120_000,
  veryStaleAfterMs: 120_000,
  vehicleVisibleMaxAgeMs: DEFAULT_VEHICLE_VISIBLE_MAX_AGE_MS,
};

export function vehicleVisibleMaxAgeMs(config: FreshnessConfig = DEFAULT_FRESHNESS_CONFIG): number {
  return config.vehicleVisibleMaxAgeMs ?? DEFAULT_VEHICLE_VISIBLE_MAX_AGE_MS;
}

export function isVehiclePubliclyVisible(
  vehicle: { observedAt: string },
  nowMs = Date.now(),
  maxAgeMs = DEFAULT_VEHICLE_VISIBLE_MAX_AGE_MS,
): boolean {
  return ageMs(vehicle.observedAt, nowMs) <= maxAgeMs;
}

export function ageMs(observedAt: string, nowMs = Date.now()): number {
  const observed = Date.parse(observedAt);
  if (Number.isNaN(observed)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, nowMs - observed);
}

export function freshnessLevel(
  age: number,
  config: FreshnessConfig = DEFAULT_FRESHNESS_CONFIG,
): FreshnessLevel {
  if (age <= config.liveAfterMs) {
    return 'live';
  }
  if (age <= config.staleAfterMs) {
    return 'stale';
  }
  return 'very_stale';
}

export function freshnessFromTimestamp(
  observedAt: string,
  nowMs = Date.now(),
  config: FreshnessConfig = DEFAULT_FRESHNESS_CONFIG,
): FreshnessLevel {
  return freshnessLevel(ageMs(observedAt, nowMs), config);
}

export function cacheFreshness(
  lastSuccessfulUpdate: string | null,
  nowMs = Date.now(),
  config: FreshnessConfig = DEFAULT_FRESHNESS_CONFIG,
): FreshnessLevel {
  if (!lastSuccessfulUpdate) {
    return 'very_stale';
  }
  return freshnessFromTimestamp(lastSuccessfulUpdate, nowMs, config);
}

export function isStale(level: FreshnessLevel): boolean {
  switch (level) {
    case 'live':
      return false;
    case 'stale':
    case 'very_stale':
      return true;
    default:
      return assertNever(level);
  }
}

export function unixSecondsToIso(value: number): string {
  const millis = value > 1e12 ? value : value * 1000;
  return new Date(millis).toISOString();
}

export function parseTimestampToIso(value: unknown, fallbackMs = Date.now()): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return unixSecondsToIso(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 1e9) {
      return unixSecondsToIso(numeric);
    }
    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const withZone = /Z$|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
    const parsed = Date.parse(withZone);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  if (fallbackMs > 0) {
    return new Date(fallbackMs).toISOString();
  }
  return null;
}
