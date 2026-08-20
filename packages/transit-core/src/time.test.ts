import { describe, expect, it } from 'vitest';
import { DEFAULT_VEHICLE_VISIBLE_MAX_AGE_MS, isVehiclePubliclyVisible } from './time.js';

describe('vehicle public visibility', () => {
  const now = Date.parse('2026-08-19T12:00:00.000Z');

  it('shows a vehicle 20 seconds old', () => {
    expect(
      isVehiclePubliclyVisible(
        { observedAt: new Date(now - 20_000).toISOString() },
        now,
        DEFAULT_VEHICLE_VISIBLE_MAX_AGE_MS,
      ),
    ).toBe(true);
  });

  it('shows a vehicle 60 seconds old', () => {
    expect(
      isVehiclePubliclyVisible(
        { observedAt: new Date(now - 60_000).toISOString() },
        now,
        DEFAULT_VEHICLE_VISIBLE_MAX_AGE_MS,
      ),
    ).toBe(true);
  });

  it('hides a vehicle 5 minutes old when a visibility cap is set', () => {
    expect(
      isVehiclePubliclyVisible(
        { observedAt: new Date(now - 5 * 60_000).toISOString() },
        now,
        DEFAULT_VEHICLE_VISIBLE_MAX_AGE_MS,
      ),
    ).toBe(false);
  });
});
