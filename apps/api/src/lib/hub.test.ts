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
        observedAt: '2026-08-19T12:00:00.000Z',
        receivedAt: '2026-08-19T12:00:00.000Z',
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

  it('holds a unit missing from one successful response and drops it after the grace window', async () => {
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
    expect(hub.snapshot('503').data.map((vehicle) => vehicle.vehicleId).sort()).toEqual(['A', 'B']);

    const afterGrace = Date.now() + 31_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(afterGrace);
    try {
      await hub.refresh();
    } finally {
      nowSpy.mockRestore();
    }
    expect(hub.snapshot('503').data.map((vehicle) => vehicle.vehicleId)).toEqual(['A']);
    hub.stop();
  });
});
