import { describe, expect, it } from 'vitest';
import {
  ageMs,
  freshnessLevel,
  isStale,
  isValidLatitude,
  isValidLongitude,
  normalizeBearing,
  parseTimestampToIso,
  parseVehiclePosition,
} from './index.js';

describe('vehicle normalization', () => {
  it('accepts a valid VehiclePosition', () => {
    const result = parseVehiclePosition({
      vehicleId: 'SG 20',
      routeId: '503',
      latitude: -38.7183,
      longitude: -62.2663,
      bearing: 90,
      observedAt: '2026-08-19T12:21:16.000Z',
      receivedAt: '2026-08-19T12:21:20.000Z',
      source: 'gpsbahia',
      rawRouteId: '6',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid latitude', () => {
    expect(isValidLatitude(91)).toBe(false);
    expect(isValidLatitude(-38.7)).toBe(true);
    const result = parseVehiclePosition({
      vehicleId: '1',
      latitude: 120,
      longitude: -62.26,
      observedAt: '2026-08-19T12:00:00.000Z',
      receivedAt: '2026-08-19T12:00:00.000Z',
      source: 'mock',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid longitude', () => {
    expect(isValidLongitude(-181)).toBe(false);
    const result = parseVehiclePosition({
      vehicleId: '1',
      latitude: -38.7,
      longitude: -200,
      observedAt: '2026-08-19T12:00:00.000Z',
      receivedAt: '2026-08-19T12:00:00.000Z',
      source: 'mock',
    });
    expect(result.success).toBe(false);
  });

  it('normalizes bearing and rejects out of range in schema', () => {
    expect(normalizeBearing(-10)).toBe(350);
    expect(normalizeBearing(360)).toBe(0);
    expect(normalizeBearing(90)).toBe(90);
    const result = parseVehiclePosition({
      vehicleId: '1',
      latitude: -38.7,
      longitude: -62.26,
      bearing: 400,
      observedAt: '2026-08-19T12:00:00.000Z',
      receivedAt: '2026-08-19T12:00:00.000Z',
      source: 'mock',
    });
    expect(result.success).toBe(false);
  });

  it('allows bearing 0', () => {
    const result = parseVehiclePosition({
      vehicleId: '1',
      latitude: -38.7,
      longitude: -62.26,
      bearing: 0,
      observedAt: '2026-08-19T12:00:00.000Z',
      receivedAt: '2026-08-19T12:00:00.000Z',
      source: 'mock',
    });
    expect(result.success).toBe(true);
  });
});

describe('timestamps and stale detection', () => {
  const now = Date.parse('2026-08-19T12:21:20.000Z');

  it('parses unix seconds and GPSBahia datetime strings as UTC', () => {
    expect(parseTimestampToIso(1784414411)).toBe('2026-07-18T22:40:11.000Z');
    expect(parseTimestampToIso('2026-08-19 12:21:16')).toBe('2026-08-19T12:21:16.000Z');
  });

  it('classifies live / stale / very stale', () => {
    expect(freshnessLevel(10_000)).toBe('live');
    expect(freshnessLevel(45_000)).toBe('stale');
    expect(freshnessLevel(200_000)).toBe('very_stale');
    expect(isStale('live')).toBe(false);
    expect(isStale('stale')).toBe(true);
  });

  it('computes age from ISO timestamps', () => {
    expect(ageMs('2026-08-19T12:21:16.000Z', now)).toBe(4000);
  });
});
