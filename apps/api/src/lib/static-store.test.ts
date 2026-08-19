import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { StaticTransitProvider, TransitLine, TransitRoute, TransitStop } from '@openbahia/transit-core';
import { StaticStore } from './static-store.js';

const route: TransitRoute = {
  id: 'gb-11',
  lineId: '503',
  direction: 'outbound',
  source: 'gpsbahia',
  path: [
    { latitude: -38.72, longitude: -62.28 },
    { latitude: -38.72, longitude: -62.24 },
  ],
};

const stop: TransitStop = {
  id: 's1',
  name: 'Mitre',
  latitude: -38.72,
  longitude: -62.26,
  routeIds: ['gb-11'],
  source: 'gpsbahia',
};

function provider(
  id: string,
  routes: TransitRoute[],
  fail = false,
): StaticTransitProvider {
  return {
    id,
    async getLines(): Promise<TransitLine[]> {
      return [{ id: '503', name: '503' }];
    },
    async getRoutes(): Promise<TransitRoute[]> {
      if (fail) {
        throw new Error('down');
      }
      return routes;
    },
    async getStops(): Promise<TransitStop[]> {
      return [stop];
    },
  };
}

describe('StaticStore', () => {
  it('keeps a valid GPSBahía cache instead of flapping to gpsbus', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ob-static-'));
    const first = new StaticStore({
      cacheDir: dir,
      providers: [provider('gpsbahia', [route])],
    });
    await first.load();
    expect(first.getMetadata()?.source).toBe('gpsbahia');

    const second = new StaticStore({
      cacheDir: dir,
      providers: [provider('gpsbahia', [route], true), provider('gpsbus', [{ ...route, source: 'gpsbus' }])],
    });
    const dataset = await second.load();
    expect(dataset.metadata.source).toBe('gpsbahia');
    expect(dataset.routes[0]?.source).toBe('gpsbahia');
  });

  it('rejects a corrupt cache and can use the next coherent source', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ob-static-'));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'routes.json'), '{truncated');
    await writeFile(join(dir, 'stops.json'), '[]');
    await writeFile(join(dir, 'metadata.json'), '{"source":"gpsbahia","version":"x","fetchedAt":"2026-08-19T00:00:00.000Z","checksum":"nope"}');
    const store = new StaticStore({
      cacheDir: dir,
      providers: [provider('gpsbahia', [route], true), provider('gpsbus', [{ ...route, source: 'gpsbus' }])],
    });
    const dataset = await store.load();
    expect(dataset.metadata.source).toBe('gpsbus');
  });

  it('keeps routes when stops provider fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ob-static-'));
    const failingStops: StaticTransitProvider = {
      id: 'gpsbahia',
      async getLines(): Promise<TransitLine[]> {
        return [{ id: '503', name: '503' }];
      },
      async getRoutes(): Promise<TransitRoute[]> {
        return [route];
      },
      async getStops(): Promise<TransitStop[]> {
        throw new Error('paradas down');
      },
    };
    const store = new StaticStore({ cacheDir: dir, providers: [failingStops] });
    const dataset = await store.load();
    expect(dataset.routes).toHaveLength(1);
    expect(dataset.stops).toEqual([]);
    expect(store.getStaticDataState()).toBe('partial');
  });
});
