import { remainingDistanceMeters } from './polyline.js';
import { nearestPointOnPolyline } from './polyline.js';
import type { NextStopHint, TransitRoute, TransitStop } from './types.js';

export function nextStopAlongRoute(
  route: TransitRoute,
  progress: number,
  stops: TransitStop[],
): NextStopHint | undefined {
  const onRoute = stops.filter((stop) => stop.routeIds.includes(route.id));
  if (onRoute.length === 0) {
    return undefined;
  }
  const ranked = onRoute
    .map((stop) => {
      const snap = nearestPointOnPolyline(
        { latitude: stop.latitude, longitude: stop.longitude },
        route.path,
      );
      return snap ? { stop, progress: snap.progress } : null;
    })
    .filter((item): item is { stop: TransitStop; progress: number } => item !== null)
    .sort((a, b) => a.progress - b.progress);
  const upcoming = ranked.find((item) => item.progress > progress + 0.002);
  if (!upcoming) {
    return undefined;
  }
  return {
    stopId: upcoming.stop.id,
    name: upcoming.stop.name,
    distanceMeters: Math.round(remainingDistanceMeters(route.path, progress, upcoming.progress)),
  };
}
