import { describe, expect, it } from 'vitest';
import { isInBahiaBlanca } from '@openbahia/transit-core';
import { MockProvider } from './index.js';

describe('MockProvider', () => {
  it('returns several buses inside Bahía Blanca', async () => {
    const provider = new MockProvider(() => Date.parse('2026-08-19T12:00:00.000Z'));
    const vehicles = await provider.getVehicles();
    expect(vehicles.length).toBeGreaterThanOrEqual(4);
    for (const vehicle of vehicles) {
      expect(isInBahiaBlanca(vehicle)).toBe(true);
      expect(vehicle.source).toBe('mock');
    }
  });

  it('filters by routeId', async () => {
    const provider = new MockProvider(() => Date.parse('2026-08-19T12:00:00.000Z'));
    const vehicles = await provider.getVehicles({ routeId: '503' });
    expect(vehicles.length).toBe(2);
    expect(vehicles.every((vehicle) => vehicle.routeId === '503')).toBe(true);
  });
});
