import { describe, expect, it } from 'vitest';
import {
  circularAngleDiff,
  interpolateAlongPolyline,
  nearestPointOnPolyline,
  nearestPointOnSegment,
  polylineLengthMeters,
  segmentBearing,
} from './polyline.js';

const a = { latitude: -38.72, longitude: -62.27 };
const b = { latitude: -38.71, longitude: -62.27 };
const c = { latitude: -38.71, longitude: -62.26 };

describe('polyline geometry', () => {
  it('snaps to the nearest point on a segment', () => {
    const mid = nearestPointOnSegment(
      { latitude: -38.715, longitude: -62.269 },
      a,
      b,
    );
    expect(mid.t).toBeGreaterThan(0.3);
    expect(mid.t).toBeLessThan(0.8);
    expect(mid.distanceMeters).toBeGreaterThan(50);
    expect(mid.distanceMeters).toBeLessThan(120);
  });

  it('snaps to a polyline and reports progress 0-1', () => {
    const path = [a, b, c];
    const snap = nearestPointOnPolyline({ latitude: -38.71, longitude: -62.265 }, path);
    expect(snap).not.toBeNull();
    expect(snap?.progress).toBeGreaterThan(0.4);
    expect(snap?.progress).toBeLessThan(1);
    expect(snap?.distanceMeters).toBeLessThan(50);
  });

  it('computes segment bearing and circular angle difference around 0°', () => {
    expect(segmentBearing(a, b)).toBeCloseTo(0, 0);
    expect(circularAngleDiff(0, 359)).toBeCloseTo(1, 5);
    expect(circularAngleDiff(10, 350)).toBeCloseTo(20, 5);
    expect(circularAngleDiff(0, 180)).toBeCloseTo(180, 5);
  });

  it('interpolates along a polyline by progress', () => {
    const path = [a, b, c];
    const total = polylineLengthMeters(path);
    expect(total).toBeGreaterThan(1500);
    const mid = interpolateAlongPolyline(path, 0, 1, 0.5);
    expect(mid).not.toBeNull();
    const snap = nearestPointOnPolyline(mid!, path);
    expect(snap?.progress).toBeCloseTo(0.5, 1);
  });
});
