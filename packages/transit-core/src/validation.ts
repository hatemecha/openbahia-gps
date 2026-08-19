import { type GpsRejectReason, type GeoPoint } from './types.js';
import { haversineMeters, isInBahiaBlancaIngest } from './geo.js';
import { assertNever } from './types.js';

export const GPS_FUTURE_SLACK_MS = 5 * 60_000;
export const GPS_JUMP_METERS = 2_500;
export const GPS_JUMP_WINDOW_MS = 20_000;
export const STATIC_SCHEMA_VERSION = 1;
export const LINE_ID_PATTERN = /^[0-9A-Za-z][0-9A-Za-z-]{0,31}$/;

export function isPlausibleLineId(value: string): boolean {
  return LINE_ID_PATTERN.test(value);
}

export function isNullIsland(point: GeoPoint): boolean {
  return Math.abs(point.latitude) < 0.01 && Math.abs(point.longitude) < 0.01;
}

export function classifyGpsObservation(args: {
  point: GeoPoint;
  observedAt: string;
  receivedAt: string;
  previous?: { point: GeoPoint; at: number };
  nowMs?: number;
}): GpsRejectReason {
  const { point } = args;
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
    return 'nan';
  }
  if (isNullIsland(point)) {
    return 'null-island';
  }
  if (!isInBahiaBlancaIngest(point)) {
    return 'out-of-bounds';
  }
  const observed = Date.parse(args.observedAt);
  const received = Date.parse(args.receivedAt);
  const now = args.nowMs ?? Date.now();
  if (!Number.isFinite(observed) || observed > Math.max(received, now) + GPS_FUTURE_SLACK_MS) {
    return 'future-timestamp';
  }
  if (args.previous) {
    const dt = observed - args.previous.at;
    if (dt >= 0 && dt < GPS_JUMP_WINDOW_MS && haversineMeters(args.previous.point, point) > GPS_JUMP_METERS) {
      return 'jump';
    }
  }
  return 'ok';
}

export function gpsRejectLogMessage(reason: GpsRejectReason, vehicleId: string): string {
  switch (reason) {
    case 'ok':
      return `gps accepted ${vehicleId}`;
    case 'nan':
      return `gps rejected ${vehicleId}: non-finite coordinates`;
    case 'null-island':
      return `gps rejected ${vehicleId}: null island`;
    case 'out-of-bounds':
      return `gps rejected ${vehicleId}: outside Bahía Blanca margin`;
    case 'future-timestamp':
      return `gps rejected ${vehicleId}: future timestamp`;
    case 'jump':
      return `gps rejected ${vehicleId}: implausible jump`;
    default:
      return assertNever(reason);
  }
}
