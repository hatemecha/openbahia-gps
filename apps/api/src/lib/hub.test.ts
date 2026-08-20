import { describe, expect, it, vi } from 'vitest';
import {
  type GetVehiclesOptions,
  type ProviderAvailability,
  type RealtimeProvider,
  type TransitLine,
  type VehiclePosition,
} from '@openbahia/transit-core';
import { VehicleHub } from './hub.js';

class CountingProvider implements RealtimeProvider {
  readonly id = 'mock';
  calls = 0;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getAvailability(): Promise<ProviderAvailability> {
    return { available: true };
  }

  async getLines(): Promise<TransitLine[]> {
    return [{ id: '503', name: '503' }];
  }

  async getVehicles(_options?: GetVehiclesOptions): Promise<VehiclePosition[]> {
    this.calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return [
      {
        vehicleId: 'A',
        lineId: '503',
        routeId: '503',
        latitude: -38.7183,
        longitude: -62.2663,
        observedAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        source: 'mock',
      },
    ];
  }
}

describe('LineRealtimeManager / VehicleHub', () => {
  it('deduplicates concurrent subscribers into a single upstream request', async () => {
    const provider = new CountingProvider();
    const hub = new VehicleHub({
      provider,
      refreshMs: 10_000,
      idleTtlMs: 120_000,
      maxActiveLines: 8,
      freshness: { liveAfterMs: 30_000, staleAfterMs: 120_000, veryStaleAfterMs: 120_000 },
      logger: { info() {}, warn() {}, error() {} } as never,
    });
    hub.start();
    const first = hub.ensureLine('503');
    const second = hub.ensureLine('503');
    await Promise.all([first, second]);
    expect(provider.calls).toBe(1);
    hub.stop();
  });

  it('serves later reads from cache without a new upstream call', async () => {
    const provider = new CountingProvider();
    const hub = new VehicleHub({
      provider,
      refreshMs: 10_000,
      idleTtlMs: 120_000,
      maxActiveLines: 8,
      freshness: { liveAfterMs: 30_000, staleAfterMs: 120_000, veryStaleAfterMs: 120_000 },
      logger: { info() {}, warn() {}, error() {} } as never,
    });
    await hub.ensureLine('503');
    await hub.ensureLine('503');
    expect(provider.calls).toBe(1);
    expect(hub.snapshot('503').data).toHaveLength(1);
    expect(hub.getMetrics().cacheHits).toBeGreaterThan(0);
    hub.stop();
  });

  it('refreshes when the cache is older than the poll interval', async () => {
    const provider = new CountingProvider();
    const hub = new VehicleHub({
      provider,
      refreshMs: 5_000,
      idleTtlMs: 120_000,
      maxActiveLines: 8,
      freshness: { liveAfterMs: 30_000, staleAfterMs: 120_000, veryStaleAfterMs: 120_000 },
      logger: { info() {}, warn() {}, error() {} } as never,
    });
    await hub.ensureLine('503');
    expect(provider.calls).toBe(1);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6_000);
    try {
      await hub.ensureLine('503');
      expect(provider.calls).toBe(2);
    } finally {
      nowSpy.mockRestore();
      hub.stop();
    }
  });

  it('keeps last vehicles when a later refresh fails', async () => {
    let calls = 0;
    const provider: RealtimeProvider = {
      id: 'gpsbahia',
      async isAvailable() {
        return calls < 1;
      },
      async getAvailability() {
        return { available: calls < 1 };
      },
      async getLines() {
        return [{ id: '503', name: '503' }];
      },
      async getVehicles() {
        calls += 1;
        if (calls > 1) {
          throw new Error('timeout');
        }
        return [
          {
            vehicleId: 'A',
            lineId: '503',
            routeId: '503',
            latitude: -38.7183,
            longitude: -62.2663,
            observedAt: new Date().toISOString(),
            receivedAt: new Date().toISOString(),
            source: 'gpsbahia',
          },
        ];
      },
    };
    const hub = new VehicleHub({
      provider,
      refreshMs: 10_000,
      idleTtlMs: 120_000,
      maxActiveLines: 8,
      freshness: { liveAfterMs: 30_000, staleAfterMs: 120_000, veryStaleAfterMs: 120_000 },
      logger: { info() {}, warn() {}, error() {} } as never,
    });
    await hub.ensureLine('503');
    expect(hub.snapshot('503').data).toHaveLength(1);
    await hub.refresh();
    const snap = hub.snapshot('503');
    expect(snap.data).toHaveLength(1);
    expect(snap.meta.realtimeState).toBe('delayed');
    hub.stop();
  });

  it('does not hold missing units as ghost vehicles on the public snapshot', async () => {
    let calls = 0;
    const observedAt = () => new Date().toISOString();
    const provider: RealtimeProvider = {
      id: 'gpsbahia',
      async isAvailable() {
        return true;
      },
      async getAvailability() {
        return { available: true };
      },
      async getLines() {
        return [{ id: '503', name: '503' }];
      },
      async getVehicles() {
        calls += 1;
        const base = {
          lineId: '503',
          routeId: '503',
          longitude: -62.2663,
          observedAt: observedAt(),
          receivedAt: observedAt(),
          source: 'gpsbahia',
        };
        const always = { ...base, vehicleId: 'A', latitude: -38.7183 };
        if (calls === 1) {
          return [always, { ...base, vehicleId: 'B', latitude: -38.7193 }];
        }
        return [always];
      },
    };
    const hub = new VehicleHub({
      provider,
      refreshMs: 10_000,
      idleTtlMs: 120_000,
      maxActiveLines: 8,
      freshness: { liveAfterMs: 30_000, staleAfterMs: 120_000, veryStaleAfterMs: 120_000 },
      logger: { info() {}, warn() {}, error() {} } as never,
    });
    await hub.ensureLine('503');
    expect(hub.snapshot('503').data.map((vehicle) => vehicle.vehicleId).sort()).toEqual(['A', 'B']);

    await hub.refresh();
    expect(hub.snapshot('503').data.map((vehicle) => vehicle.vehicleId)).toEqual(['A']);
    hub.stop();
  });

  it('filters vehicle fixes older than the public visibility window', async () => {
    const now = Date.parse('2026-08-19T12:00:00.000Z');
    const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString();
    const provider: RealtimeProvider = {
      id: 'gpsbahia',
      async isAvailable() {
        return true;
      },
      async getAvailability() {
        return { available: true };
      },
      async getLines() {
        return [{ id: '506', name: '506' }];
      },
      async getVehicles() {
        return [
          {
            vehicleId: 'SG 23',
            lineId: '506',
            latitude: -38.7183,
            longitude: -62.2663,
            observedAt: iso(20_000),
            receivedAt: iso(0),
            source: 'gpsbahia',
          },
          {
            vehicleId: 'SG 60',
            lineId: '506',
            latitude: -38.7193,
            longitude: -62.2663,
            observedAt: iso(60_000),
            receivedAt: iso(0),
            source: 'gpsbahia',
          },
          {
            vehicleId: 'SG 40',
            lineId: '506',
            latitude: -38.72,
            longitude: -62.26,
            observedAt: iso(5 * 60_000),
            receivedAt: iso(0),
            source: 'gpsbahia',
          },
        ];
      },
    };
    const hub = new VehicleHub({
      provider,
      refreshMs: 10_000,
      idleTtlMs: 120_000,
      maxActiveLines: 8,
      freshness: {
        liveAfterMs: 30_000,
        staleAfterMs: 120_000,
        veryStaleAfterMs: 120_000,
        vehicleVisibleMaxAgeMs: 120_000,
      },
      logger: { info() {}, warn() {}, error() {} } as never,
    });
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      await hub.ensureLine('506');
      expect(hub.snapshot('506').data.map((vehicle) => vehicle.vehicleId).sort()).toEqual([
        'SG 23',
        'SG 60',
      ]);
    } finally {
      nowSpy.mockRestore();
      hub.stop();
    }
  });

  it('filters fresh GPSBahia fixes that are clearly outside the selected route', async () => {
    const now = Date.parse('2026-08-19T12:00:00.000Z');
    const rawLatitude = -38.72 + 900 / 111_320;
    const provider: RealtimeProvider = {
      id: 'gpsbahia',
      async isAvailable() {
        return true;
      },
      async getAvailability() {
        return { available: true };
      },
      async getLines() {
        return [{ id: '513', name: '513' }];
      },
      async getVehicles() {
        return [
          {
            vehicleId: 'SG-off',
            lineId: '513',
            routeId: '513',
            latitude: rawLatitude,
            longitude: -62.26,
            observedAt: new Date(now - 15_000).toISOString(),
            receivedAt: new Date(now).toISOString(),
            source: 'gpsbahia',
            direction: 'outbound',
            routeAssignmentSource: 'provider',
          },
        ];
      },
    };
    const hub = new VehicleHub({
      provider,
      refreshMs: 10_000,
      idleTtlMs: 120_000,
      maxActiveLines: 8,
      freshness: { liveAfterMs: 30_000, staleAfterMs: 120_000, veryStaleAfterMs: 120_000 },
      logger: { info() {}, warn() {}, error() {} } as never,
      staticStore: {
        getRoutes: () => [
          {
            id: 'out',
            lineId: '513',
            direction: 'outbound',
            source: 'test',
            path: [
              { latitude: -38.72, longitude: -62.28 },
              { latitude: -38.72, longitude: -62.24 },
            ],
          },
        ],
        getStops: () => [
          {
            id: 'next',
            name: 'Falsa',
            latitude: -38.72,
            longitude: -62.25,
            routeIds: ['out'],
            source: 'test',
          },
        ],
        getLines: () => [{ id: '513', name: '513' }],
        getStaticDataState: () => 'ready',
      } as never,
    });
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      await hub.ensureLine('513');
      expect(hub.snapshot('513').data).toEqual([]);
    } finally {
      nowSpy.mockRestore();
      hub.stop();
    }
  });

  it('quarantines a single implausible GPS jump instead of publishing it', async () => {
    const firstAt = Date.parse('2026-08-19T12:00:00.000Z');
    let calls = 0;
    const provider: RealtimeProvider = {
      id: 'gpsbahia',
      async isAvailable() {
        return true;
      },
      async getAvailability() {
        return { available: true };
      },
      async getLines() {
        return [{ id: '503', name: '503' }];
      },
      async getVehicles() {
        calls += 1;
        if (calls === 1) {
          return [
            {
              vehicleId: 'A',
              lineId: '503',
              latitude: -38.7183,
              longitude: -62.2663,
              observedAt: new Date(firstAt).toISOString(),
              receivedAt: new Date(firstAt).toISOString(),
              source: 'gpsbahia',
            },
          ];
        }
        return [
          {
            vehicleId: 'A',
            lineId: '503',
            latitude: -38.69,
            longitude: -62.23,
            observedAt: new Date(firstAt + 5_000).toISOString(),
            receivedAt: new Date(firstAt + 5_000).toISOString(),
            source: 'gpsbahia',
          },
        ];
      },
    };
    const hub = new VehicleHub({
      provider,
      refreshMs: 5_000,
      idleTtlMs: 120_000,
      maxActiveLines: 8,
      freshness: { liveAfterMs: 30_000, staleAfterMs: 120_000, veryStaleAfterMs: 120_000 },
      logger: { info() {}, warn() {}, error() {} } as never,
    });
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(firstAt);
    try {
      await hub.ensureLine('503');
      expect(hub.snapshot('503').data).toHaveLength(1);
      nowSpy.mockReturnValue(firstAt + 5_000);
      await hub.refresh();
      expect(hub.snapshot('503').data).toEqual([]);
    } finally {
      nowSpy.mockRestore();
      hub.stop();
    }
  });
});
