import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { latestStorageVersion, parseGpsBusRoutes, parseGpsBusStops } from './parse-static.js';

const root = dirname(fileURLToPath(import.meta.url));
const versions = JSON.parse(readFileSync(join(root, '../fixtures/versions.json'), 'utf8')) as unknown;
const routesRaw = JSON.parse(readFileSync(join(root, '../fixtures/routes-sample.json'), 'utf8')) as unknown;
const stopVersions = JSON.parse(readFileSync(join(root, '../fixtures/stops-versions.json'), 'utf8')) as unknown;
const stopsRaw = JSON.parse(readFileSync(join(root, '../fixtures/stops-sample.json'), 'utf8')) as unknown;

describe('gpsbus static parser', () => {
  it('reads versions.json instead of hardcoding a file version', () => {
    expect(latestStorageVersion(versions, 'routes')).toEqual({ format: 2, version: 83 });
    expect(latestStorageVersion(stopVersions, 'stops')).toEqual({ format: 1, version: 95 });
  });

  it('maps going/returning paths to outbound/inbound', () => {
    const routes = parseGpsBusRoutes(routesRaw);
    expect(routes.length).toBe(4);
    expect(routes.some((route) => route.lineId === '503' && route.direction === 'outbound')).toBe(true);
    expect(routes.some((route) => route.lineId === '503' && route.direction === 'inbound')).toBe(true);
    expect(routes[0]?.path[0]?.latitude).toBeLessThan(0);
    expect(routes[0]?.source).toBe('gpsbus');
  });

  it('parses stops without inventing names', () => {
    const stops = parseGpsBusStops(stopsRaw);
    expect(stops).toHaveLength(2);
    expect(stops[0]?.name).toBeUndefined();
    expect(stops[0]?.routeIds[0]).toMatch(/^gpsbus-/);
  });
});
