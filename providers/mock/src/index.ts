import {
  interpolatePoint,
  isInBahiaBlanca,
  parseVehiclePosition,
  type GetVehiclesOptions,
  type ProviderAvailability,
  type RealtimeProvider,
  type StaticTransitProvider,
  type TransitLine,
  type TransitRoute,
  type TransitStop,
  type VehiclePosition,
} from '@openbahia/transit-core';

interface MockBus {
  vehicleId: string;
  routeId: string;
  path: Array<{ latitude: number; longitude: number }>;
  periodMs: number;
  phaseMs: number;
}

const LINES: TransitLine[] = [
  { id: '503', name: '503', shortName: '503', rawRouteId: 'mock-503', hasRealtime: true, hasRoutes: true },
  { id: '504', name: '504', shortName: '504', rawRouteId: 'mock-504', hasRealtime: true, hasRoutes: true },
  { id: '509', name: '509', shortName: '509', rawRouteId: 'mock-509', hasRealtime: true, hasRoutes: true },
  { id: '512', name: '512', shortName: '512', rawRouteId: 'mock-512', hasRealtime: true, hasRoutes: true },
  { id: '599', name: '599', shortName: '599', rawRouteId: 'mock-599', hasRealtime: true, hasRoutes: false },
];

const BUSES: MockBus[] = [
  {
    vehicleId: 'M-32',
    routeId: '503',
    periodMs: 12 * 60_000,
    phaseMs: 0,
    path: [
      { latitude: -38.7186, longitude: -62.2655 },
      { latitude: -38.7142, longitude: -62.2721 },
      { latitude: -38.7078, longitude: -62.2784 },
      { latitude: -38.7029, longitude: -62.271 },
      { latitude: -38.7084, longitude: -62.2622 },
      { latitude: -38.7158, longitude: -62.2588 },
      { latitude: -38.7186, longitude: -62.2655 },
    ],
  },
  {
    vehicleId: 'M-18',
    routeId: '503',
    periodMs: 12 * 60_000,
    phaseMs: 6 * 60_000,
    path: [
      { latitude: -38.7186, longitude: -62.2655 },
      { latitude: -38.7142, longitude: -62.2721 },
      { latitude: -38.7078, longitude: -62.2784 },
      { latitude: -38.7029, longitude: -62.271 },
      { latitude: -38.7084, longitude: -62.2622 },
      { latitude: -38.7158, longitude: -62.2588 },
      { latitude: -38.7186, longitude: -62.2655 },
    ],
  },
  {
    vehicleId: 'M-07',
    routeId: '504',
    periodMs: 14 * 60_000,
    phaseMs: 90_000,
    path: [
      { latitude: -38.7212, longitude: -62.2594 },
      { latitude: -38.7284, longitude: -62.2528 },
      { latitude: -38.7356, longitude: -62.2481 },
      { latitude: -38.741, longitude: -62.2566 },
      { latitude: -38.7332, longitude: -62.265 },
      { latitude: -38.7241, longitude: -62.2668 },
      { latitude: -38.7212, longitude: -62.2594 },
    ],
  },
  {
    vehicleId: 'M-41',
    routeId: '509',
    periodMs: 16 * 60_000,
    phaseMs: 180_000,
    path: [
      { latitude: -38.7199, longitude: -62.2708 },
      { latitude: -38.7265, longitude: -62.2782 },
      { latitude: -38.7338, longitude: -62.2855 },
      { latitude: -38.7288, longitude: -62.2944 },
      { latitude: -38.7204, longitude: -62.2861 },
      { latitude: -38.7162, longitude: -62.2764 },
      { latitude: -38.7199, longitude: -62.2708 },
    ],
  },
  {
    vehicleId: 'M-12',
    routeId: '512',
    periodMs: 15 * 60_000,
    phaseMs: 240_000,
    path: [
      { latitude: -38.7104, longitude: -62.2522 },
      { latitude: -38.7051, longitude: -62.2458 },
      { latitude: -38.6988, longitude: -62.2514 },
      { latitude: -38.7022, longitude: -62.2628 },
      { latitude: -38.7086, longitude: -62.2591 },
      { latitude: -38.7104, longitude: -62.2522 },
    ],
  },
  {
    vehicleId: 'M-55',
    routeId: '504',
    periodMs: 14 * 60_000,
    phaseMs: 7 * 60_000,
    path: [
      { latitude: -38.7212, longitude: -62.2594 },
      { latitude: -38.7284, longitude: -62.2528 },
      { latitude: -38.7356, longitude: -62.2481 },
      { latitude: -38.741, longitude: -62.2566 },
      { latitude: -38.7332, longitude: -62.265 },
      { latitude: -38.7241, longitude: -62.2668 },
      { latitude: -38.7212, longitude: -62.2594 },
    ],
  },
];

function bearingBetween(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const y = to.longitude - from.longitude;
  const x = to.latitude - from.latitude;
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

function positionAlong(bus: MockBus, nowMs: number) {
  const t = ((nowMs + bus.phaseMs) % bus.periodMs) / bus.periodMs;
  const segments = bus.path.length - 1;
  const scaled = t * segments;
  const index = Math.min(segments - 1, Math.floor(scaled));
  const localT = scaled - index;
  const from = bus.path[index]!;
  const to = bus.path[index + 1]!;
  const point = interpolatePoint(from, to, localT);
  return {
    point,
    bearing: bearingBetween(from, to),
  };
}

export class MockProvider implements RealtimeProvider {
  readonly id = 'mock';

  constructor(private readonly now: () => number = () => Date.now()) {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getAvailability(): Promise<ProviderAvailability> {
    return { available: true };
  }

  async getLines(): Promise<TransitLine[]> {
    return LINES;
  }

  async getVehicles(options?: GetVehiclesOptions): Promise<VehiclePosition[]> {
    const nowMs = this.now();
    const receivedAt = new Date(nowMs).toISOString();
    const selected = BUSES.filter((bus) => {
      const wanted = options?.lineId ?? options?.routeId;
      return wanted ? bus.routeId === wanted : true;
    });

    return selected.flatMap((bus) => {
      const { point, bearing } = positionAlong(bus, nowMs);
      if (!isInBahiaBlanca(point)) {
        return [];
      }
      const parsed = parseVehiclePosition({
        vehicleId: bus.vehicleId,
        lineId: bus.routeId,
        routeId: bus.routeId,
        latitude: point.latitude,
        longitude: point.longitude,
        bearing,
        speed: 8.3,
        observedAt: receivedAt,
        receivedAt,
        source: this.id,
        rawRouteId: `mock-${bus.routeId}`,
        direction: bus.vehicleId === 'M-55' ? 'inbound' : 'outbound',
        routeAssignmentSource: 'unknown',
        positionKind: 'gps',
      });
      return parsed.success ? [parsed.data] : [];
    });
  }
}

export class MockStaticProvider implements StaticTransitProvider {
  readonly id = 'mock';

  async getLines(): Promise<TransitLine[]> {
    return LINES;
  }

  async getRoutes(options?: { lineId?: string }): Promise<TransitRoute[]> {
    const unique = new Map<string, TransitRoute>();
    for (const bus of BUSES) {
      if (unique.has(bus.routeId)) {
        continue;
      }
      unique.set(bus.routeId, {
        id: `mock-${bus.routeId}-loop`,
        lineId: bus.routeId,
        name: bus.routeId,
        direction: bus.vehicleId === 'M-55' ? 'inbound' : 'outbound',
        path: bus.path,
        source: 'mock',
      });
    }
    const routes = [...unique.values()];
    return options?.lineId ? routes.filter((route) => route.lineId === options.lineId) : routes;
  }

  async getStops(options?: { lineId?: string; routeId?: string }): Promise<TransitStop[]> {
    const routes = await this.getRoutes(options);
    return routes.flatMap((route) => {
      const mid = route.path[Math.floor(route.path.length / 2)];
      if (!mid) {
        return [];
      }
      if (options?.routeId && route.id !== options.routeId) {
        return [];
      }
      return [
        {
          id: `mock-stop-${route.lineId}`,
          name: `Parada ${route.lineId}`,
          latitude: mid.latitude,
          longitude: mid.longitude,
          routeIds: [route.id],
          source: 'mock',
        },
      ];
    });
  }
}
