import { describe, expect, it } from 'vitest';
import {
  MATCH_DISPLAY_DISTANCE_M,
  MATCH_DISPLAY_RELEASE_DISTANCE_M,
  classifyRouteMatch,
  enrichMatchedVehicle,
  matchVehicleToRoutes,
  shouldUseMatchedPosition,
} from './matching.js';
import { nextStopAlongRoute } from './next-stop.js';
import { parseTravelDirection } from './direction.js';
import type { TransitRoute, TransitStop } from './types.js';

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

describe('direction parsing', () => {
  it('maps ida/vuelta and gpsbus going/returning', () => {
    expect(parseTravelDirection('ida')).toBe('outbound');
    expect(parseTravelDirection('vuelta')).toBe('inbound');
    expect(parseTravelDirection('going')).toBe('outbound');
    expect(parseTravelDirection('returning')).toBe('inbound');
    expect(parseTravelDirection('return')).toBe('inbound');
    expect(parseTravelDirection('nope')).toBe('unknown');
  });
});

describe('route matching', () => {
  it('uses provider direction when GPSBahia already sent ida/vuelta', () => {
    const match = matchVehicleToRoutes(
      {
        latitude: -38.7202,
        longitude: -62.26,
        bearing: 90,
        direction: 'outbound',
        routeAssignmentSource: 'provider',
      },
      [outbound, inbound],
    );
    expect(match?.routeId).toBe('out');
    expect(match?.assignmentSource).toBe('provider');
    expect(match?.direction).toBe('outbound');
    expect(match?.distanceFromRouteMeters).toBeLessThan(40);
  });

  it('distinguishes parallel inbound/outbound using heading', () => {
    const match = matchVehicleToRoutes({ latitude: -38.72015, longitude: -62.26, bearing: 270 }, [
      outbound,
      inbound,
    ]);
    expect(match?.routeId).toBe('in');
    expect(match?.direction).toBe('inbound');
    expect(match?.assignmentSource).toBe('map-matching');
  });

  it('matches GPS about 20 m off the street', () => {
    const match = matchVehicleToRoutes({ latitude: -38.72018, longitude: -62.26, bearing: 90 }, [
      outbound,
      inbound,
    ]);
    expect(match?.distanceFromRouteMeters).toBeGreaterThan(10);
    expect(match?.distanceFromRouteMeters).toBeLessThan(40);
    expect(match?.routeId).toBe('out');
    expect(shouldUseMatchedPosition(match)).toBe(true);
  });

  it('does not claim a direction when GPS is clearly off route', () => {
    const match = matchVehicleToRoutes({ latitude: -38.75, longitude: -62.22, bearing: 90 }, [
      outbound,
      inbound,
    ]);
    expect(match?.direction).toBe('unknown');
    expect(match?.assignmentSource).toBe('unknown');
    expect(shouldUseMatchedPosition(match)).toBe(false);
  });

  it('keeps previous outbound under GPS noise instead of flipping', () => {
    const previous = matchVehicleToRoutes({ latitude: -38.72, longitude: -62.26, bearing: 90 }, [
      outbound,
      inbound,
    ]);
    const noisy = matchVehicleToRoutes(
      { latitude: -38.72012, longitude: -62.26, bearing: 108 },
      [outbound, inbound],
      { previous },
    );
    expect(noisy?.direction).toBe('outbound');
    expect(noisy?.routeId).toBe('out');
  });

  it('accepts a real route change when the new candidate is clearly better', () => {
    const previous = matchVehicleToRoutes({ latitude: -38.72, longitude: -62.278, bearing: 90 }, [
      outbound,
      inbound,
    ]);
    const changed = matchVehicleToRoutes(
      { latitude: -38.72, longitude: -62.245, bearing: 270 },
      [outbound, inbound],
      { previous },
    );
    expect(changed?.direction).toBe('inbound');
  });

  it('does not over-weight heading for a stopped vehicle', () => {
    const match = matchVehicleToRoutes(
      { latitude: -38.72, longitude: -62.26, bearing: 270 },
      [outbound, inbound],
      { speedMps: 0 },
    );
    expect(match?.distanceFromRouteMeters).toBeLessThan(20);
  });

  it('lets heading override a stale provider ida when the bus is on vuelta', () => {
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
    expect(match?.routeId).toBe('in');
    expect(match?.direction).toBe('inbound');
    expect(match?.assignmentSource).toBe('map-matching');
    expect(shouldUseMatchedPosition(match)).toBe(true);

    const vehicle = {
      vehicleId: 'M-stale-ida',
      lineId: '503',
      latitude: -38.72015,
      longitude: -62.26,
      bearing: 270,
      observedAt: '2026-08-19T12:00:00.000Z',
      receivedAt: '2026-08-19T12:00:00.000Z',
      source: 'gpsbahia',
      direction: 'outbound' as const,
      routeAssignmentSource: 'provider' as const,
    };
    const enriched = enrichMatchedVehicle({
      vehicle,
      match,
      routes: [outbound, inbound],
      stops: [],
    });
    expect(enriched.direction).toBe('inbound');
  });

  it('keeps drawing the snapped position under GPS noise once it was snapped', () => {
    const vehicle = {
      vehicleId: 'M-noisy',
      lineId: '503',
      latitude: -38.72 + 55 / 111_320,
      longitude: -62.26,
      bearing: 90,
      observedAt: '2026-08-19T12:00:00.000Z',
      receivedAt: '2026-08-19T12:00:00.000Z',
      source: 'gpsbahia',
      direction: 'outbound' as const,
      routeAssignmentSource: 'provider' as const,
    };
    const match = matchVehicleToRoutes(vehicle, [outbound, inbound]);
    expect(match?.distanceFromRouteMeters).toBeGreaterThan(MATCH_DISPLAY_DISTANCE_M);
    expect(match?.distanceFromRouteMeters).toBeLessThan(MATCH_DISPLAY_RELEASE_DISTANCE_M);

    expect(shouldUseMatchedPosition(match)).toBe(false);
    expect(shouldUseMatchedPosition(match, true)).toBe(true);

    const fresh = enrichMatchedVehicle({ vehicle, match, routes: [outbound, inbound], stops: [] });
    expect(fresh.positionKind).toBe('gps');

    const held = enrichMatchedVehicle({
      vehicle,
      match,
      routes: [outbound, inbound],
      stops: [],
      previousPositionKind: 'map-matched',
    });
    expect(held.positionKind).toBe('map-matched');
  });

  it('still releases the snapped position when the bus really leaves the route', () => {
    const vehicle = {
      vehicleId: 'M-left-route',
      lineId: '503',
      latitude: -38.72 + 220 / 111_320,
      longitude: -62.26,
      bearing: 90,
      observedAt: '2026-08-19T12:00:00.000Z',
      receivedAt: '2026-08-19T12:00:00.000Z',
      source: 'gpsbahia',
      direction: 'outbound' as const,
      routeAssignmentSource: 'provider' as const,
    };
    const match = matchVehicleToRoutes(vehicle, [outbound, inbound]);
    expect(shouldUseMatchedPosition(match, true)).toBe(false);
    const enriched = enrichMatchedVehicle({
      vehicle,
      match,
      routes: [outbound, inbound],
      stops: [],
      previousPositionKind: 'map-matched',
    });
    expect(enriched.positionKind).toBe('gps');
    expect(enriched.latitude).toBe(vehicle.latitude);
  });

  it('finds the next stop ahead on the route without inventing an ETA', () => {
    const stops: TransitStop[] = [
      {
        id: 'past',
        latitude: -38.72,
        longitude: -62.278,
        routeIds: ['out'],
        source: 'test',
        name: 'Inicio',
      },
      {
        id: 'next',
        latitude: -38.72,
        longitude: -62.25,
        routeIds: ['out'],
        source: 'test',
        name: 'Mitre',
      },
    ];
    const match = matchVehicleToRoutes({ latitude: -38.72, longitude: -62.26, bearing: 90 }, [
      outbound,
    ]);
    const next = nextStopAlongRoute(outbound, match?.progress ?? 0, stops);
    expect(next?.stopId).toBe('next');
    expect(next?.name).toBe('Mitre');
    expect(next?.distanceMeters).toBeGreaterThan(100);
  });
});

describe('504 ~242 m off-route fixture', () => {
  const route504: TransitRoute = {
    id: 'gb-13',
    lineId: '504',
    direction: 'outbound',
    source: 'test',
    path: [
      { latitude: -38.72, longitude: -62.28 },
      { latitude: -38.72, longitude: -62.24 },
    ],
  };

  const stops: TransitStop[] = [
    {
      id: 'aria',
      name: 'AV. ARIAS 602',
      latitude: -38.72,
      longitude: -62.255,
      routeIds: ['gb-13'],
      source: 'test',
    },
  ];

  const rawLatitude = -38.72 + 242 / 111_320;

  it('keeps raw GPS, skips snap presentation, and does not invent a next stop', () => {
    const vehicle = {
      vehicleId: 'SG-outlier',
      lineId: '504',
      routeId: '504',
      latitude: rawLatitude,
      longitude: -62.26,
      observedAt: '2026-08-19T12:00:00.000Z',
      receivedAt: '2026-08-19T12:00:00.000Z',
      source: 'gpsbahia',
      direction: 'outbound' as const,
      routeAssignmentSource: 'provider' as const,
    };
    const match = matchVehicleToRoutes(vehicle, [route504]);
    expect(match?.distanceFromRouteMeters).toBeGreaterThan(230);
    expect(match?.distanceFromRouteMeters).toBeLessThan(255);
    expect(shouldUseMatchedPosition(match)).toBe(false);

    const enriched = enrichMatchedVehicle({ vehicle, match, routes: [route504], stops });
    expect(enriched.latitude).toBe(rawLatitude);
    expect(enriched.longitude).toBe(-62.26);
    expect(enriched.positionKind).toBe('gps');
    expect(enriched.routeMatchState).toBe('off-route');
    expect(enriched.nextStop).toBeUndefined();
    expect(enriched.direction).toBe('outbound');
    expect(classifyRouteMatch(match, true)).toBe('off-route');
  });
});
