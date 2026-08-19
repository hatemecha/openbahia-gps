import {
  BAHIA_BLANCA_LINES,
  isValidLatitude,
  isValidLongitude,
  normalizeBearing,
  parseTimestampToIso,
  parseTravelDirection,
  parseVehiclePosition,
  resolveRouteId,
  type TravelDirection,
  type VehiclePosition,
} from '@openbahia/transit-core';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export interface GpsBahiaTrackResponse {
  status?: string;
  error?: string;
  token?: unknown;
  data?: unknown;
}

export type GpsBahiaTrackKind = 'vehicles' | 'empty' | 'invalid-session' | 'invalid-token' | 'error';

export function classifyGpsBahiaTrack(raw: unknown): GpsBahiaTrackKind {
  const record = asRecord(raw);
  if (!record) {
    return 'error';
  }
  const error = asString(record.error);
  if (error === 'invalidToken') {
    return 'invalid-token';
  }
  const rows = Array.isArray(record.data) ? record.data : [];
  const hasTokenField = Object.prototype.hasOwnProperty.call(record, 'token') && record.token != null;
  if (record.status === 'ok' && hasTokenField && rows.length === 0) {
    return 'invalid-session';
  }
  if (record.status && record.status !== 'ok') {
    return 'error';
  }
  if (rows.length === 0) {
    return 'empty';
  }
  return 'vehicles';
}

export function parseGpsBahiaTrackPayload(
  raw: unknown,
  options: { routeId?: string; rawRouteId?: string; receivedAt?: string; source?: string } = {},
): VehiclePosition[] {
  const record = asRecord(raw);
  const rows = Array.isArray(record?.data) ? record.data : Array.isArray(raw) ? raw : [];
  const receivedAt = options.receivedAt ?? new Date().toISOString();
  const source = options.source ?? 'gpsbahia';
  const line = resolveRouteId(options.routeId) ?? resolveRouteId(options.rawRouteId);
  const vehicles: VehiclePosition[] = [];

  for (const row of rows) {
    const item = asRecord(row);
    if (!item) {
      continue;
    }
    const latitude = asNumber(item.lat);
    const longitude = asNumber(item.lng);
    if (latitude === null || longitude === null || !isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      continue;
    }
    const vehicleId = asString(item.interno) ?? asString(item.name) ?? asString(item.imei);
    if (!vehicleId) {
      continue;
    }
    const observedAt = parseTimestampToIso(item.dt_tracker ?? item.dt_server, Date.parse(receivedAt));
    if (!observedAt) {
      continue;
    }
    const bearingRaw = asNumber(item.angle);
    const speedRaw = asNumber(item.speed);
    const providerDirection = parseGpsBahiaDirection(asString(item.direccion));
    const parsed = parseVehiclePosition({
      vehicleId,
      lineId: line?.id ?? options.routeId,
      routeId: line?.id ?? options.routeId,
      latitude,
      longitude,
      bearing: bearingRaw === null ? undefined : normalizeBearing(bearingRaw),
      speed: speedRaw === null ? undefined : speedRaw,
      observedAt,
      receivedAt,
      source,
      rawRouteId: options.rawRouteId ?? line?.rawRouteId,
      direction: providerDirection,
      routeAssignmentSource: providerDirection === 'unknown' ? 'unknown' : 'provider',
      positionKind: 'gps',
    });
    if (parsed.success) {
      vehicles.push(parsed.data);
    }
  }

  return vehicles;
}

export function parseGpsBahiaDirection(value: string | null): TravelDirection {
  return parseTravelDirection(value ?? undefined);
}

export function gpsBahiaLines() {
  return BAHIA_BLANCA_LINES.map(({ id, name, shortName, rawRouteId }) => ({
    id,
    name,
    shortName,
    rawRouteId,
    hasRealtime: true,
  }));
}

export function extractPublicPageToken(html: string): string | null {
  const match = html.match(/vgggaxqq\s*=\s*'([a-f0-9]+)'/i);
  return match?.[1] ?? null;
}

export function cookieHeaderFromSetCookie(setCookie: string[]): string {
  return setCookie
    .map((entry) => entry.split(';')[0]?.trim())
    .filter((part): part is string => Boolean(part))
    .join('; ');
}
