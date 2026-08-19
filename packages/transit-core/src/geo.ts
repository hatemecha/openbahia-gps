import type { GeoPoint } from './types.js';

const EARTH_RADIUS_M = 6371000;

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineMeters(from: GeoPoint, to: GeoPoint): number {
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function interpolatePoint(from: GeoPoint, to: GeoPoint, t: number): GeoPoint {
  const clamped = Math.min(1, Math.max(0, t));
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * clamped,
    longitude: from.longitude + (to.longitude - from.longitude) * clamped,
  };
}

export const DEFAULT_MAX_JUMP_METERS = 800;

export function interpolatePosition(
  from: GeoPoint,
  to: GeoPoint,
  t: number,
  maxJumpMeters = DEFAULT_MAX_JUMP_METERS,
): GeoPoint {
  if (haversineMeters(from, to) > maxJumpMeters) {
    return to;
  }
  return interpolatePoint(from, to, t);
}

export function interpolateBearing(from: number | undefined, to: number | undefined, t: number): number | undefined {
  if (to === undefined) {
    return from;
  }
  if (from === undefined) {
    return to;
  }
  const clamped = Math.min(1, Math.max(0, t));
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * clamped + 360) % 360;
}

export const BAHIA_BLANCA_CENTER: GeoPoint = {
  latitude: -38.7183,
  longitude: -62.2663,
};

export const BAHIA_BLANCA_BOUNDS = {
  minLatitude: -38.8,
  maxLatitude: -38.65,
  minLongitude: -62.35,
  maxLongitude: -62.15,
};

/** Wider ingest box so we drop 0,0 / other cities without clipping real Bahía suburbs. */
export const BAHIA_BLANCA_INGEST_BOUNDS = {
  minLatitude: -38.95,
  maxLatitude: -38.5,
  minLongitude: -62.55,
  maxLongitude: -61.9,
};

export function isInBahiaBlanca(point: GeoPoint): boolean {
  return (
    point.latitude >= BAHIA_BLANCA_BOUNDS.minLatitude &&
    point.latitude <= BAHIA_BLANCA_BOUNDS.maxLatitude &&
    point.longitude >= BAHIA_BLANCA_BOUNDS.minLongitude &&
    point.longitude <= BAHIA_BLANCA_BOUNDS.maxLongitude
  );
}

export function isInBahiaBlancaIngest(point: GeoPoint): boolean {
  return (
    point.latitude >= BAHIA_BLANCA_INGEST_BOUNDS.minLatitude &&
    point.latitude <= BAHIA_BLANCA_INGEST_BOUNDS.maxLatitude &&
    point.longitude >= BAHIA_BLANCA_INGEST_BOUNDS.minLongitude &&
    point.longitude <= BAHIA_BLANCA_INGEST_BOUNDS.maxLongitude
  );
}
