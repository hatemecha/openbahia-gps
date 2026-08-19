import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseGpsBusSnapshot } from './parse.js';

const fixture = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../fixtures/buses-bhi-6.json'), 'utf8'),
) as unknown;

describe('gpsbus parser', () => {
  it('normalizes a public Firebase line snapshot', () => {
    const wrapped = { 6: fixture };
    const vehicles = parseGpsBusSnapshot(wrapped, {
      receivedAt: '2026-08-19T12:00:00.000Z',
      source: 'gpsbus',
    });
    expect(vehicles.length).toBe(2);
    expect(vehicles[0]?.routeId).toBe('503');
    expect(vehicles[0]?.source).toBe('gpsbus');
    expect(vehicles[0]?.latitude).toBeGreaterThan(-39);
    expect(vehicles[0]?.latitude).toBeLessThan(-38);
    expect(vehicles[0]?.observedAt).toMatch(/2026-07-18T/);
  });

  it('handles sparse arrays of lines', () => {
    const sparse: unknown[] = [];
    sparse[6] = fixture;
    const vehicles = parseGpsBusSnapshot(sparse, {
      receivedAt: '2026-08-19T12:00:00.000Z',
    });
    expect(vehicles.length).toBe(2);
    expect(vehicles[0]?.rawRouteId).toBe('6');
  });
});
