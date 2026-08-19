import { describe, expect, it } from 'vitest';
import { interpolatePosition } from '@openbahia/transit-core';
import { displayPoint, type AnimatedVehicle } from './motion';
import type { VehiclePosition } from './types';
import type { TransitRoute } from '@openbahia/transit-core';

const sample: VehiclePosition = {
  vehicleId: '1',
  latitude: -38.7183,
  longitude: -62.2663,
  observedAt: '2026-08-19T12:00:00.000Z',
  receivedAt: '2026-08-19T12:00:00.000Z',
  source: 'mock',
};

describe('smooth movement helper', () => {
  it('interpolates geographically between positions', () => {
    const vehicle: AnimatedVehicle = {
      vehicleId: '1',
      from: { latitude: -38.7183, longitude: -62.2663 },
      to: { latitude: -38.7193, longitude: -62.2673 },
      startedAt: 0,
      durationMs: 1000,
      observedAt: '2026-08-19T12:00:00.000Z',
      receivedAt: '2026-08-19T12:00:00.000Z',
      source: 'mock',
      skipInterpolation: false,
      vehicle: sample,
    };
    const mid = displayPoint(vehicle, 500);
    const expected = interpolatePosition(vehicle.from, vehicle.to, 0.5);
    expect(mid.latitude).toBeCloseTo(expected.latitude, 6);
  });

  it('does not interpolate absurd jumps', () => {
    const vehicle: AnimatedVehicle = {
      vehicleId: '1',
      from: { latitude: -38.7183, longitude: -62.2663 },
      to: { latitude: -38.65, longitude: -62.15 },
      startedAt: 0,
      durationMs: 1000,
      observedAt: '2026-08-19T12:00:00.000Z',
      receivedAt: '2026-08-19T12:00:00.000Z',
      source: 'mock',
      skipInterpolation: true,
      vehicle: sample,
    };
    const shown = displayPoint(vehicle, 500);
    expect(shown.latitude).toBe(vehicle.to.latitude);
  });

  it('does not interpolate along route when the vehicle is shown as raw GPS', () => {
    const route: TransitRoute = {
      id: 'r',
      lineId: 'l',
      direction: 'outbound',
      source: 'test',
      path: [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
      ],
    };

    const vehicle: AnimatedVehicle = {
      vehicleId: '1',
      from: { latitude: 0, longitude: 0 },
      to: { latitude: 0.1, longitude: 0.1 },
      startedAt: 0,
      durationMs: 1000,
      observedAt: '2026-08-19T12:00:00.000Z',
      receivedAt: '2026-08-19T12:00:00.000Z',
      source: 'mock',
      skipInterpolation: false,
      fromProgress: 0,
      toProgress: 1,
      matchedRouteId: route.id,
      vehicle: {
        ...sample,
        positionKind: 'gps',
      },
    };

    const mid = displayPoint(vehicle, 500, route);
    const expected = interpolatePosition(vehicle.from, vehicle.to, 0.5);
    expect(mid.latitude).toBeCloseTo(expected.latitude, 10);
    expect(mid.longitude).toBeCloseTo(expected.longitude, 10);
  });
});
