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

  it('uses ColectivosYa route intersection coordinates and the latest history timestamp', () => {
    const vehicles = parseGpsBusSnapshot(
      {
        12: {
          imei: {
            history: {
              newer: {
                angle: 120,
                date: 1_784_414_400,
                position: { lat: -38.7, lng: -62.3 },
              },
              older: {
                angle: 90,
                date: 1_784_414_000,
                position: { lat: -38.71, lng: -62.31 },
              },
            },
            route: {
              id: 'route-513',
              item: 'segment-4',
              angle: 118,
              date: 1_784_414_400,
              position: { lat: -38.7005, lng: -62.2995 },
            },
          },
        },
      },
      { receivedAt: '2026-08-19T12:00:00.000Z' },
    );

    expect(vehicles).toHaveLength(1);
    expect(vehicles[0]).toMatchObject({
      latitude: -38.7005,
      longitude: -62.2995,
      bearing: 118,
      rawRouteId: '12',
      routeId: '513',
    });
    expect(vehicles[0]?.observedAt).toBe(new Date(1_784_414_400 * 1000).toISOString());
  });

  it('falls back to history when the route intersection is incomplete', () => {
    const vehicles = parseGpsBusSnapshot({
      12: {
        imei: {
          history: [
            {
              angle: 90,
              date: 1_784_414_400,
              position: { lat: -38.71, lng: -62.31 },
            },
          ],
          route: {
            id: 'route-513',
            item: 'segment-4',
            angle: 118,
            position: { lat: -38.7005, lng: -62.2995 },
          },
        },
      },
    });

    expect(vehicles).toHaveLength(1);
    expect(vehicles[0]).toMatchObject({
      latitude: -38.71,
      longitude: -62.31,
      bearing: 90,
    });
  });
});
