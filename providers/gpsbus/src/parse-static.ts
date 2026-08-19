import {
  isValidLatitude,
  isValidLongitude,
  lineByRawRouteId,
  parseTravelDirection,
  resolveRouteId,
  type TransitLine,
  type TransitRoute,
  type TransitStop,
} from '@openbahia/transit-core';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function latestStorageVersion(versions: unknown, kind: 'routes' | 'stops'): { format: number; version: number } | null {
  const record = asRecord(versions);
  if (!record) {
    return null;
  }
  if (kind === 'stops') {
    const lastFormat = Number(record['last-format-version']);
    const lastVersions = asRecord(record['last-stops-versions']);
    const version = lastVersions ? Number(lastVersions[String(lastFormat)]) : NaN;
    if (Number.isFinite(lastFormat) && Number.isFinite(version)) {
      return { format: lastFormat, version };
    }
  }
  const numeric = Object.entries(record)
    .map(([format, version]) => ({ format: Number(format), version: Number(version) }))
    .filter((item) => Number.isFinite(item.format) && Number.isFinite(item.version));
  numeric.sort((a, b) => a.format - b.format);
  return numeric.at(-1) ?? null;
}

export function parseGpsBusRoutes(raw: unknown, source = 'gpsbus'): TransitRoute[] {
  const record = asRecord(raw);
  const rows = Array.isArray(record?.routes) ? record.routes : Array.isArray(raw) ? raw : [];
  const routes: TransitRoute[] = [];
  for (const row of rows) {
    const item = asRecord(row);
    if (!item) {
      continue;
    }
    const id = asString(item.id);
    const rawLineId = asString(item.lineID);
    if (!id || !rawLineId) {
      continue;
    }
    const line = lineByRawRouteId(rawLineId) ?? resolveRouteId(rawLineId);
    const pathRaw = Array.isArray(item.path) ? item.path : [];
    const path = pathRaw
      .map((point) => {
        const coords = asRecord(point);
        if (!coords) {
          return null;
        }
        const latitude = Number(coords.lat);
        const longitude = Number(coords.lng);
        if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
          return null;
        }
        return { latitude, longitude };
      })
      .filter((point): point is { latitude: number; longitude: number } => point !== null);
    if (path.length < 2) {
      continue;
    }
    const group = asString(item.group);
    routes.push({
      id: `gpsbus-${id}`,
      lineId: line?.id ?? rawLineId,
      name: line?.name ?? rawLineId,
      direction: parseTravelDirection(asString(item.direction)),
      branch: group ?? undefined,
      path,
      source,
    });
  }
  return routes;
}

export function parseGpsBusStops(raw: unknown, source = 'gpsbus'): TransitStop[] {
  const record = asRecord(raw);
  const rows = Array.isArray(record?.stops) ? record.stops : Array.isArray(raw) ? raw : [];
  const stops: TransitStop[] = [];
  for (const row of rows) {
    const item = asRecord(row);
    if (!item) {
      continue;
    }
    const id = asString(item.id);
    const position = asRecord(item.position);
    if (!id || !position) {
      continue;
    }
    const latitude = Number(position.lat);
    const longitude = Number(position.lng);
    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      continue;
    }
    const routeIds = Array.isArray(item.routes)
      ? item.routes
          .map((value) => asString(value))
          .filter((value): value is string => Boolean(value))
          .map((value) => `gpsbus-${value}`)
      : [];
    stops.push({
      id: `gpsbus-stop-${id}`,
      latitude,
      longitude,
      routeIds,
      source,
    });
  }
  return stops;
}

export function gpsBusStaticLines(routes: TransitRoute[]): TransitLine[] {
  const seen = new Map<string, TransitLine>();
  for (const route of routes) {
    if (seen.has(route.lineId)) {
      continue;
    }
    const known = resolveRouteId(route.lineId);
    seen.set(route.lineId, {
      id: route.lineId,
      name: known?.name ?? route.name ?? route.lineId,
      shortName: known?.shortName,
      rawRouteId: known?.rawRouteId,
      hasRoutes: true,
      hasRealtime: false,
    });
  }
  return [...seen.values()];
}

export function firebaseStorageMediaUrl(bucket: string, objectPath: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media`;
}
