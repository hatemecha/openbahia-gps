import type { TransitRoute } from './types.js';

export interface RouteGeoJsonFeature {
  type: 'Feature';
  id: string;
  properties: {
    id: string;
    lineId: string;
    name?: string;
    direction: TransitRoute['direction'];
    branch?: string;
    source: string;
  };
  geometry: {
    type: 'LineString';
    coordinates: Array<[number, number]>;
  };
}

export interface RouteFeatureCollection {
  type: 'FeatureCollection';
  features: RouteGeoJsonFeature[];
}

export function routesToGeoJson(routes: TransitRoute[]): RouteFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: routes.map((route) => ({
      type: 'Feature' as const,
      id: route.id,
      properties: {
        id: route.id,
        lineId: route.lineId,
        name: route.name,
        direction: route.direction,
        branch: route.branch,
        source: route.source,
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: route.path.map((point): [number, number] => [point.longitude, point.latitude]),
      },
    })),
  };
}

export function stopsToGeoJson(stops: Array<{ id: string; name?: string; latitude: number; longitude: number; routeIds: string[] }>) {
  return {
    type: 'FeatureCollection' as const,
    features: stops.map((stop) => ({
      type: 'Feature' as const,
      id: stop.id,
      properties: {
        id: stop.id,
        name: stop.name,
        routeIds: stop.routeIds,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [stop.longitude, stop.latitude] as [number, number],
      },
    })),
  };
}
