import { describe, expect, it } from 'vitest';
import { classifyGpsObservation, isPlausibleLineId } from './validation.js';

const now = Date.parse('2026-08-19T12:00:00.000Z');
const observedAt = '2026-08-19T12:00:00.000Z';
const receivedAt = '2026-08-19T12:00:01.000Z';

describe('GPS observation validation', () => {
  it('accepts a point inside Bahía Blanca', () => {
    expect(
      classifyGpsObservation({
        point: { latitude: -38.7183, longitude: -62.2663 },
        observedAt,
        receivedAt,
        nowMs: now,
      }),
    ).toBe('ok');
  });

  it('rejects NaN, null island, out of bounds, and future timestamps', () => {
    expect(
      classifyGpsObservation({
        point: { latitude: Number.NaN, longitude: -62.26 },
        observedAt,
        receivedAt,
        nowMs: now,
      }),
    ).toBe('nan');
    expect(
      classifyGpsObservation({
        point: { latitude: 0, longitude: 0 },
        observedAt,
        receivedAt,
        nowMs: now,
      }),
    ).toBe('null-island');
    expect(
      classifyGpsObservation({
        point: { latitude: -34.6, longitude: -58.4 },
        observedAt,
        receivedAt,
        nowMs: now,
      }),
    ).toBe('out-of-bounds');
    expect(
      classifyGpsObservation({
        point: { latitude: -38.72, longitude: -62.26 },
        observedAt: '2026-08-19T15:00:00.000Z',
        receivedAt,
        nowMs: now,
      }),
    ).toBe('future-timestamp');
  });

  it('flags an implausible km-scale jump in a few seconds', () => {
    expect(
      classifyGpsObservation({
        point: { latitude: -38.75, longitude: -62.2 },
        observedAt: '2026-08-19T12:00:05.000Z',
        receivedAt: '2026-08-19T12:00:06.000Z',
        previous: { point: { latitude: -38.72, longitude: -62.28 }, at: now },
        nowMs: now + 6000,
      }),
    ).toBe('jump');
  });

  it('accepts plausible line ids and rejects garbage', () => {
    expect(isPlausibleLineId('503')).toBe(true);
    expect(isPlausibleLineId('500-2')).toBe(true);
    expect(isPlausibleLineId('<script>')).toBe(false);
    expect(isPlausibleLineId('')).toBe(false);
  });
});
