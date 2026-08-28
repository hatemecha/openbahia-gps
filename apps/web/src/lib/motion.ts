import {
  interpolateAlongPolyline,
  interpolateBearing,
  interpolatePosition,
  type GeoPoint,
} from '@openbahia/transit-core';
import type { TransitRoute, VehiclePosition } from './types';

/** v0.1: the marker is the last valid GPS fix. Re-enable later for smoothing. */
export const VISUAL_ROUTE_INTERPOLATION = false;
export const VISUAL_GEO_INTERPOLATION = false;

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
    Number.isFinite(vehicle.matchedLatitude) &&
    Number.isFinite(vehicle.matchedLongitude)
  ) {
    return {
      latitude: vehicle.matchedLatitude as number,
      longitude: vehicle.matchedLongitude as number,
    };
  }
  return {
    latitude: vehicle.latitude,
    longitude: vehicle.longitude,
  };
}

export function displayPoint(
  vehicle: AnimatedVehicle,
  nowMs: number,
  route?: TransitRoute,
): GeoPoint & { bearing?: number } {
  if (vehicle.skipInterpolation || (!VISUAL_GEO_INTERPOLATION && !VISUAL_ROUTE_INTERPOLATION)) {
    return {
      ...vehicle.to,
      bearing: vehicle.toBearing,
    };
  }
  const t = Math.min(1, Math.max(0, (nowMs - vehicle.startedAt) / vehicle.durationMs));
  if (
    VISUAL_ROUTE_INTERPOLATION &&
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
  if (!VISUAL_GEO_INTERPOLATION) {
    return {
      ...vehicle.to,
      bearing: vehicle.toBearing,
    };
  }
  const point = interpolatePosition(vehicle.from, vehicle.to, t);
  return {
    ...point,
    bearing: interpolateBearing(vehicle.fromBearing, vehicle.toBearing, t),
  };
}
