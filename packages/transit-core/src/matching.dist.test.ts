import { describe, expect, it } from 'vitest';
import { enrichMatchedVehicle, matchVehicleToRoutes } from '../dist/matching.js';
import { circularAngleDiff } from '../dist/polyline.js';
import type { TransitRoute } from './types.js';

const outbound: TransitRoute = {
  id: 'out',
  lineId: '503',
  direction: 'outbound',
  source: 'test',
  path: [
    { latitude: -38.72, longitude: -62.28 },
    { latitude: -38.72, longitude: -62.26 },
    { latitude: -38.72, longitude: -62.24 },
  ],
};

const inbound: TransitRoute = {
  id: 'in',
  lineId: '503',
  direction: 'inbound',
  source: 'test',
  path: [
    { latitude: -38.72, longitude: -62.24 },
    { latitude: -38.72, longitude: -62.26 },
    { latitude: -38.72, longitude: -62.28 },
  ],
};

describe('built dist matching contract', () => {
  it('overrides stale provider ida when heading matches vuelta in dist output', () => {
    const match = matchVehicleToRoutes(
      {
        latitude: -38.72015,
        longitude: -62.26,
        bearing: 270,
        direction: 'outbound',
        routeAssignmentSource: 'provider',
      },
      [outbound, inbound],
    );
    expect(match?.direction).toBe('inbound');

    const enriched = enrichMatchedVehicle({
      vehicle: {
        vehicleId: 'dist-contract',
        lineId: '503',
        latitude: -38.72015,
        longitude: -62.26,
        bearing: 270,
        observedAt: '2026-08-19T12:00:00.000Z',
        receivedAt: '2026-08-19T12:00:00.000Z',
        source: 'gpsbahia',
        direction: 'outbound',
        routeAssignmentSource: 'provider',
      },
      match,
      routes: [outbound, inbound],
      stops: [],
    });
    expect(enriched.direction).toBe('inbound');
    expect(circularAngleDiff(enriched.bearing!, match!.segmentBearing)).toBeLessThanOrEqual(90);
  });
});
