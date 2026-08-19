import { isDeterminedDirection } from './direction.js';
import { circularAngleDiff, nearestPointOnPolyline } from './polyline.js';
import type {
  GeoPoint,
  PositionKind,
  RouteMatch,
  RouteMatchState,
  TransitRoute,
  TransitStop,
  TravelDirection,
  VehiclePosition,
} from './types.js';
import { nextStopAlongRoute } from './next-stop.js';

export const MATCH_MAX_DISTANCE_M = 180;
export const MATCH_ON_ROUTE_DISTANCE_M = 80;
export const MATCH_DISPLAY_DISTANCE_M = 45;
export const MATCH_DISPLAY_CONFIDENCE = 0.68;
export const MATCH_DISPLAY_RELEASE_DISTANCE_M = 70;
export const MATCH_DISPLAY_RELEASE_CONFIDENCE = 0.55;
export const MATCH_HYSTERESIS_CONFIDENCE = 0.12;
export const MATCH_HYSTERESIS_DISTANCE_M = 18;
export const MATCH_HEADING_MAX_DIFF = 90;
export const MATCH_STOPPED_SPEED_MPS = 1.2;

export interface MatchContext {
  previous?: RouteMatch | null;
  speedMps?: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function distanceScore(distanceMeters: number): number {
  return clamp01(1 - distanceMeters / MATCH_MAX_DISTANCE_M);
}

function headingScore(
  vehicleBearing: number | undefined,
  segmentBearing: number,
  speedMps: number | undefined,
): number {
  if (
    vehicleBearing === undefined ||
    (speedMps !== undefined && speedMps < MATCH_STOPPED_SPEED_MPS)
  ) {
    return 0.5;
  }
  const diff = circularAngleDiff(vehicleBearing, segmentBearing);
  return clamp01(1 - diff / MATCH_HEADING_MAX_DIFF);
}

function continuityScore(previous: RouteMatch | null | undefined, route: TransitRoute): number {
  if (!previous) {
    return 0.45;
  }
  if (previous.routeId === route.id) {
    return 1;
  }
  if (previous.direction === route.direction && isDeterminedDirection(route.direction)) {
    return 0.55;
  }
  return 0.2;
}

function providerPrior(
  route: TransitRoute,
  providerDirection: TravelDirection | undefined,
): number {
  if (!providerDirection || !isDeterminedDirection(providerDirection)) {
    return 0.5;
  }
  return route.direction === providerDirection ? 1 : 0.18;
}

function confidenceFor(args: {
  distanceMeters: number;
  vehicleBearing?: number;
  segmentBearing: number;
  speedMps?: number;
  previous?: RouteMatch | null;
  route: TransitRoute;
  providerDirection?: TravelDirection;
}): number {
  const dist = distanceScore(args.distanceMeters);
  const heading = headingScore(args.vehicleBearing, args.segmentBearing, args.speedMps);
  const continuity = continuityScore(args.previous, args.route);
  const provider = providerPrior(args.route, args.providerDirection);
  return clamp01(0.42 * dist + 0.3 * heading + 0.16 * continuity + 0.12 * provider);
}

function snapToRoute(
  point: GeoPoint,
  route: TransitRoute,
  vehicle: Pick<VehiclePosition, 'bearing' | 'direction' | 'routeAssignmentSource'>,
  context: MatchContext,
  assignmentSource: RouteMatch['assignmentSource'],
): RouteMatch | null {
  const snap = nearestPointOnPolyline(point, route.path);
  if (!snap) {
    return null;
  }
  const providerDirection =
    vehicle.routeAssignmentSource === 'provider' ? vehicle.direction : undefined;
  return {
    routeId: route.id,
    direction: route.direction,
    distanceFromRouteMeters: snap.distanceMeters,
    progress: snap.progress,
    confidence: confidenceFor({
      distanceMeters: snap.distanceMeters,
      vehicleBearing: vehicle.bearing,
      segmentBearing: snap.segmentBearing,
      speedMps: context.speedMps,
      previous: context.previous,
      route,
      providerDirection,
    }),
    matchedPoint: snap.point,
    assignmentSource,
  };
}

function shouldKeepPrevious(current: RouteMatch, resnap: RouteMatch): boolean {
  if (resnap.routeId === current.routeId) {
    return false;
  }
  const flipped =
    isDeterminedDirection(resnap.direction) &&
    isDeterminedDirection(current.direction) &&
    resnap.direction !== current.direction;
  const onlySlightlyBetter = current.confidence - resnap.confidence < MATCH_HYSTERESIS_CONFIDENCE;
  const previousStillClose =
    resnap.distanceFromRouteMeters <= current.distanceFromRouteMeters + MATCH_HYSTERESIS_DISTANCE_M;
  return (
    (flipped || resnap.routeId !== current.routeId) && onlySlightlyBetter && previousStillClose
  );
}

export function matchVehicleToRoutes(
  vehicle: Pick<
    VehiclePosition,
    'latitude' | 'longitude' | 'bearing' | 'direction' | 'routeAssignmentSource'
  >,
  routes: TransitRoute[],
  context: MatchContext = {},
): RouteMatch | null {
  if (routes.length === 0) {
    return null;
  }
  const point = { latitude: vehicle.latitude, longitude: vehicle.longitude };
  const providerDirection =
    vehicle.routeAssignmentSource === 'provider' ? vehicle.direction : undefined;

  let best: RouteMatch | null = null;
  for (const route of routes) {
    const candidate = snapToRoute(point, route, vehicle, context, 'map-matching');
    if (!candidate) {
      continue;
    }
    if (!best || candidate.confidence > best.confidence) {
      best = candidate;
    }
  }
  if (!best) {
    return null;
  }
  let chosen = best;
  if (context.previous) {
    const previousRoute = routes.find((route) => route.id === context.previous?.routeId);
    const resnap = previousRoute
      ? snapToRoute(point, previousRoute, vehicle, context, 'map-matching')
      : null;
    if (resnap && shouldKeepPrevious(best, resnap)) {
      chosen = resnap;
    }
  }
  const assignmentSource: RouteMatch['assignmentSource'] =
    providerDirection &&
    isDeterminedDirection(providerDirection) &&
    chosen.direction === providerDirection
      ? 'provider'
      : 'map-matching';
  chosen = { ...chosen, assignmentSource };
  if (chosen.distanceFromRouteMeters > MATCH_MAX_DISTANCE_M) {
    return {
      ...chosen,
      direction: 'unknown' satisfies TravelDirection,
      confidence: Math.min(chosen.confidence, 0.35),
      assignmentSource: 'unknown',
    };
  }
  return chosen;
}

/**
 * Asymmetric thresholds: entering the snapped presentation demands a strong match,
 * leaving it demands a clearly worse one. Without this gap, GPS noise around the
 * entry threshold flips the drawn point between raw and snapped on every poll.
 */
export function shouldUseMatchedPosition(
  match: RouteMatch | null | undefined,
  wasMatched = false,
): boolean {
  if (!match) {
    return false;
  }
  if (wasMatched) {
    return (
      match.confidence >= MATCH_DISPLAY_RELEASE_CONFIDENCE &&
      match.distanceFromRouteMeters <= MATCH_DISPLAY_RELEASE_DISTANCE_M
    );
  }
  return (
    match.confidence >= MATCH_DISPLAY_CONFIDENCE &&
    match.distanceFromRouteMeters <= MATCH_DISPLAY_DISTANCE_M
  );
}

export function classifyRouteMatch(
  match: RouteMatch | null | undefined,
  hasRoutes: boolean,
): RouteMatchState {
  if (!hasRoutes || !match) {
    return 'not-available';
  }
  if (
    match.distanceFromRouteMeters > MATCH_MAX_DISTANCE_M ||
    match.assignmentSource === 'unknown'
  ) {
    return 'off-route';
  }
  if (match.confidence < 0.58 || match.distanceFromRouteMeters > MATCH_ON_ROUTE_DISTANCE_M) {
    return 'uncertain';
  }
  return 'matched';
}

export function enrichMatchedVehicle(args: {
  vehicle: VehiclePosition;
  match: RouteMatch | null;
  routes: TransitRoute[];
  stops: TransitStop[];
  previousPositionKind?: PositionKind;
}): VehiclePosition {
  const { vehicle, match, routes, stops } = args;
  const routeMatchState = classifyRouteMatch(match, routes.length > 0);
  if (!match) {
    return { ...vehicle, positionKind: 'gps', routeMatchState };
  }

  const wasMatched = args.previousPositionKind === 'map-matched';
  const canSnap =
    routeMatchState === 'matched' || (wasMatched && routeMatchState === 'uncertain');
  const useMatched = canSnap && shouldUseMatchedPosition(match, wasMatched);
  const route = routes.find((item) => item.id === match.routeId);
  const nextStop =
    routeMatchState === 'matched' && route
      ? nextStopAlongRoute(route, match.progress, stops)
      : undefined;

  return {
    ...vehicle,
    matchedRouteId: match.routeId,
    matchedLatitude: match.matchedPoint.latitude,
    matchedLongitude: match.matchedPoint.longitude,
    routeProgress: match.progress,
    routeConfidence: match.confidence,
    distanceFromRouteMeters: match.distanceFromRouteMeters,
    direction:
      routeMatchState === 'matched' || routeMatchState === 'uncertain'
        ? match.direction
        : vehicle.direction,
    routeAssignmentSource: match.assignmentSource,
    positionKind: useMatched ? 'map-matched' : 'gps',
    routeMatchState,
    nextStop,
  };
}

export function directionIsReliable(match: RouteMatch | null | undefined): boolean {
  if (!match) {
    return false;
  }
  if (match.direction === 'unknown') {
    return false;
  }
  if (
    match.assignmentSource === 'provider' &&
    match.distanceFromRouteMeters <= MATCH_MAX_DISTANCE_M
  ) {
    return true;
  }
  return match.confidence >= 0.58 && match.distanceFromRouteMeters <= MATCH_ON_ROUTE_DISTANCE_M;
}
