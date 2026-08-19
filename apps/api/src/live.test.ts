import { GpsBahiaProvider } from '@openbahia/provider-gpsbahia';
import { describe, expect, it } from 'vitest';

const enabled = process.env.LIVE_GPS === '1';

describe.skipIf(!enabled)('live GPS smoke (not CI)', () => {
  it('reads 503 and 504 from GPSBahía without crashing', async () => {
    const provider = new GpsBahiaProvider();
    const lines = await provider.getLines();
    expect(lines.some((line) => line.id === '503')).toBe(true);
    const a = await provider.getVehicles({ lineId: '503' });
    const b = await provider.getVehicles({ lineId: '504' });
    expect(a.length + b.length).toBeGreaterThan(0);
    for (const vehicle of [...a, ...b]) {
      expect(Number.isFinite(vehicle.latitude)).toBe(true);
      expect(vehicle.latitude).not.toBe(0);
    }
  });
});
