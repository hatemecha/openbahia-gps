import { describe, expect, it } from 'vitest';
import {
  haversineMeters,
  interpolateBearing,
  interpolatePosition,
  isInBahiaBlanca,
} from './geo.js';

describe('geo interpolation', () => {
  it('interpolates short hops and skips absurd jumps', () => {
    const from = { latitude: -38.7183, longitude: -62.2663 };
    const to = { latitude: -38.7193, longitude: -62.2673 };
    const mid = interpolatePosition(from, to, 0.5);
    expect(mid.latitude).toBeCloseTo(-38.7188, 4);
    expect(haversineMeters(from, to)).toBeGreaterThan(50);
    expect(haversineMeters(from, to)).toBeLessThan(800);

    const far = { latitude: -38.65, longitude: -62.15 };
    const jumped = interpolatePosition(from, far, 0.5, 800);
    expect(jumped).toEqual(far);
  });

  it('interpolates bearing across 0 degrees', () => {
    expect(interpolateBearing(350, 10, 0.5)).toBeCloseTo(0, 5);
  });

  it('keeps mock-like points inside Bahía Blanca', () => {
    expect(isInBahiaBlanca({ latitude: -38.7183, longitude: -62.2663 })).toBe(true);
    expect(isInBahiaBlanca({ latitude: 0, longitude: 0 })).toBe(false);
  });
});
