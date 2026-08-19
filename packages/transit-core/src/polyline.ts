import { haversineMeters } from './geo.js';
import type { GeoPoint } from './types.js';

const METERS_PER_DEG_LAT = 111_320;

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function lonScale(latitude: number): number {
  return METERS_PER_DEG_LAT * Math.cos(toRad(latitude));
}

function toLocal(point: GeoPoint, origin: GeoPoint): { x: number; y: number } {
  return {
    x: (point.longitude - origin.longitude) * lonScale(origin.latitude),
    y: (point.latitude - origin.latitude) * METERS_PER_DEG_LAT,
  };
}

function fromLocal(local: { x: number; y: number }, origin: GeoPoint): GeoPoint {
  return {
    latitude: origin.latitude + local.y / METERS_PER_DEG_LAT,
    longitude: origin.longitude + local.x / lonScale(origin.latitude),
  };
}

export interface PolylineSnap {
  point: GeoPoint;
  segmentIndex: number;
  t: number;
  distanceMeters: number;
  progress: number;
  segmentBearing: number;
}

export function circularAngleDiff(a: number, b: number): number {
  const delta = Math.abs(((a - b + 540) % 360) - 180);
  return Math.min(delta, 360 - delta);
}

export function segmentBearing(from: GeoPoint, to: GeoPoint): number {
  const y = to.longitude - from.longitude;
  const x = to.latitude - from.latitude;
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function polylineLengthMeters(path: GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const from = path[i - 1];
    const to = path[i];
    if (!from || !to) {
      continue;
    }
    total += haversineMeters(from, to);
  }
  return total;
}

export function nearestPointOnSegment(
  point: GeoPoint,
  from: GeoPoint,
  to: GeoPoint,
): { point: GeoPoint; t: number; distanceMeters: number } {
  const origin = from;
  const p = toLocal(point, origin);
  const a = toLocal(from, origin);
  const b = toLocal(to, origin);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq));
  const snapped = fromLocal({ x: a.x + abx * t, y: a.y + aby * t }, origin);
  return {
    point: snapped,
    t,
    distanceMeters: haversineMeters(point, snapped),
  };
}

export function nearestPointOnPolyline(point: GeoPoint, path: GeoPoint[]): PolylineSnap | null {
  if (path.length < 2) {
    return null;
  }
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const from = path[i - 1];
    const to = path[i];
    if (!from || !to) {
      lengths.push(0);
      continue;
    }
    const length = haversineMeters(from, to);
    lengths.push(length);
    total += length;
  }
  let best: PolylineSnap | null = null;
  let traveled = 0;
  for (let i = 1; i < path.length; i += 1) {
    const from = path[i - 1];
    const to = path[i];
    const segmentLength = lengths[i - 1] ?? 0;
    if (!from || !to) {
      continue;
    }
    const snap = nearestPointOnSegment(point, from, to);
    const along = traveled + snap.t * segmentLength;
    const candidate: PolylineSnap = {
      point: snap.point,
      segmentIndex: i - 1,
      t: snap.t,
      distanceMeters: snap.distanceMeters,
      progress: total > 0 ? along / total : 0,
      segmentBearing: segmentBearing(from, to),
    };
    if (!best || candidate.distanceMeters < best.distanceMeters) {
      best = candidate;
    }
    traveled += segmentLength;
  }
  return best;
}

export function pointAtProgress(path: GeoPoint[], progress: number): GeoPoint | null {
  if (path.length === 0) {
    return null;
  }
  if (path.length === 1) {
    return path[0] ?? null;
  }
  const clamped = Math.min(1, Math.max(0, progress));
  const total = polylineLengthMeters(path);
  if (total === 0) {
    return path[0] ?? null;
  }
  let remaining = clamped * total;
  for (let i = 1; i < path.length; i += 1) {
    const from = path[i - 1];
    const to = path[i];
    if (!from || !to) {
      continue;
    }
    const length = haversineMeters(from, to);
    if (remaining <= length || i === path.length - 1) {
      const t = length === 0 ? 0 : remaining / length;
      return {
        latitude: from.latitude + (to.latitude - from.latitude) * t,
        longitude: from.longitude + (to.longitude - from.longitude) * t,
      };
    }
    remaining -= length;
  }
  return path[path.length - 1] ?? null;
}

export function interpolateAlongPolyline(
  path: GeoPoint[],
  fromProgress: number,
  toProgress: number,
  t: number,
): GeoPoint | null {
  const clamped = Math.min(1, Math.max(0, t));
  return pointAtProgress(path, fromProgress + (toProgress - fromProgress) * clamped);
}

export function remainingDistanceMeters(path: GeoPoint[], fromProgress: number, toProgress: number): number {
  const total = polylineLengthMeters(path);
  return Math.max(0, (toProgress - fromProgress) * total);
}
