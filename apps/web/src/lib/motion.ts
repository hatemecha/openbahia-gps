import {
  interpolateAlongPolyline,
  interpolateBearing,
  interpolatePosition,
  type GeoPoint,
} from '@openbahia/transit-core';
import type { TransitRoute, VehiclePosition } from './types';

export interface AnimatedVehicle {
  vehicleId: string;
  lineId?: string;
  routeId?: string;
  from: GeoPoint;
  to: GeoPoint;
  fromBearing?: number;
  toBearing?: number;
  startedAt: number;
  durationMs: number;
  observedAt: string;
  receivedAt: string;
  source: string;
  skipInterpolation: boolean;
  fromProgress?: number;
  toProgress?: number;
  matchedRouteId?: string;
  vehicle: VehiclePosition;
}

export function displayCoords(vehicle: VehiclePosition): GeoPoint {
  if (
    vehicle.positionKind === 'map-matched' &&
    vehicle.matchedLatitude !== undefined &&
    vehicle.matchedLongitude !== undefined
  ) {
    return { latitude: vehicle.matchedLatitude, longitude: vehicle.matchedLongitude };
  }
  return { latitude: vehicle.latitude, longitude: vehicle.longitude };
}

export function displayPoint(
  vehicle: AnimatedVehicle,
  nowMs: number,
  route?: TransitRoute,
): GeoPoint & { bearing?: number } {
  if (vehicle.skipInterpolation) {
    return {
      ...vehicle.to,
      bearing: vehicle.toBearing,
    };
  }
  const t = Math.min(1, Math.max(0, (nowMs - vehicle.startedAt) / vehicle.durationMs));
  if (
    route &&
    vehicle.vehicle.positionKind === 'map-matched' &&
    vehicle.fromProgress !== undefined &&
    vehicle.toProgress !== undefined &&
    vehicle.matchedRouteId === route.id
  ) {
    const along = interpolateAlongPolyline(route.path, vehicle.fromProgress, vehicle.toProgress, t);
    if (along) {
      return {
        ...along,
        bearing: interpolateBearing(vehicle.fromBearing, vehicle.toBearing, t),
      };
    }
  }
  const point = interpolatePosition(vehicle.from, vehicle.to, t);
  return {
    ...point,
    bearing: interpolateBearing(vehicle.fromBearing, vehicle.toBearing, t),
  };
}
