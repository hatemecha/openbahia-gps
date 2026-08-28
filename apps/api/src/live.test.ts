import { GpsBahiaProvider } from '@openbahia/provider-gpsbahia';
import { describe, expect, it } from 'vitest';

const enabled = process.env.LIVE_GPS === '1';

describe.skipIf(!enabled)('live GPS smoke (not CI)', () => {
  it('reads representative lines from GPSBahía without crashing', async () => {
    const provider = new GpsBahiaProvider();
    const lines = await provider.getLines();
    expect(lines.some((line) => line.id === '503')).toBe(true);
    const snapshots = await Promise.all(
      ['503', '504', '513'].map((lineId) => provider.getVehicles({ lineId })),
    );
    const vehicles = snapshots.flat();
    expect(vehicles.length).toBeGreaterThan(0);
    for (const vehicle of vehicles) {
      expect(Number.isFinite(vehicle.latitude)).toBe(true);
      expect(vehicle.latitude).not.toBe(0);
    }
  });
});
