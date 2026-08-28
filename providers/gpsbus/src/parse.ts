import {
  BAHIA_BLANCA_LINES,
  isValidLatitude,
  isValidLongitude,
  lineByRawRouteId,
  normalizeBearing,
  parseTimestampToIso,
  parseVehiclePosition,
  resolveRouteId,
  type VehiclePosition,
} from '@openbahia/transit-core';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asEntries(value: unknown): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => (item == null ? [] : [[String(index), item] as [string, unknown]]));
  }
  const record = asRecord(value);
  return record ? Object.entries(record) : [];
}

function lastHistoryState(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const history = record.history;
  if (Array.isArray(history) && history.length > 0) {
    return latestDatedRecord(history);
  }
  if (history && typeof history === 'object') {
    const values = Object.values(history as Record<string, unknown>);
    return latestDatedRecord(values);
  }
  return asRecord(record);
}

function latestDatedRecord(values: unknown[]): Record<string, unknown> | null {
  let latest: Record<string, unknown> | null = null;
  let latestDate = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const record = asRecord(value);
    if (!record) {
      continue;
    }
    const date = typeof record.date === 'number' ? record.date : Number(record.date);
    if (!Number.isFinite(date)) {
      continue;
    }
    if (date >= latestDate) {
      latest = record;
      latestDate = date;
    }
  }
  return latest;
}

function routeIntersectionState(value: unknown): Record<string, unknown> | null {
  const bus = asRecord(value);
  const route = asRecord(bus?.route);
  if (!route || typeof route.id !== 'string' || typeof route.item !== 'string') {
    return null;
  }
  const angle = typeof route.angle === 'number' ? route.angle : Number(route.angle);
  const date = typeof route.date === 'number' ? route.date : Number(route.date);
  return parseLatLng(route.position) && Number.isFinite(angle) && Number.isFinite(date)
    ? route
    : null;
}

function parseLatLng(value: unknown): { latitude: number; longitude: number } | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const latitude = typeof record.lat === 'number' ? record.lat : Number(record.lat);
  const longitude = typeof record.lng === 'number' ? record.lng : Number(record.lng);
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return null;
  }
  return { latitude, longitude };
}

export function parseGpsBusSnapshot(
  raw: unknown,
  options: { cityKey?: string; receivedAt?: string; source?: string } = {},
): VehiclePosition[] {
  const receivedAt = options.receivedAt ?? new Date().toISOString();
  const source = options.source ?? 'gpsbus';
  const root = asRecord(raw);
  const cityPayload = options.cityKey && root ? root[options.cityKey] : raw;
  const lineEntries = asEntries(cityPayload);
  const vehicles: VehiclePosition[] = [];

  for (const [rawRouteId, buses] of lineEntries) {
    const line = lineByRawRouteId(rawRouteId);
    for (const [vehicleId, bus] of asEntries(buses)) {
      const lastHistory = lastHistoryState(bus);
      if (!lastHistory) {
        continue;
      }
      // ColectivosYa renders the backend-computed route intersection when present.
      const displayedState = routeIntersectionState(bus) ?? lastHistory;
      const position = parseLatLng(displayedState.position);
      if (!position) {
        continue;
      }
      const observedAt = parseTimestampToIso(lastHistory.date, Date.parse(receivedAt));
      if (!observedAt) {
        continue;
      }
      const bearingRaw =
        typeof displayedState.angle === 'number'
          ? displayedState.angle
          : typeof displayedState.angle === 'string'
            ? Number(displayedState.angle)
            : undefined;
      const parsed = parseVehiclePosition({
        vehicleId,
        routeId: line?.id ?? rawRouteId,
        latitude: position.latitude,
        longitude: position.longitude,
        bearing: bearingRaw === undefined ? undefined : normalizeBearing(bearingRaw),
        observedAt,
        receivedAt,
        source,
        rawRouteId,
      });
      if (parsed.success) {
        vehicles.push(parsed.data);
      }
    }
  }

  return vehicles;
}

export function filterVehicles(
  vehicles: VehiclePosition[],
  routeId?: string,
): VehiclePosition[] {
  if (!routeId) {
    return vehicles;
  }
  const line = resolveRouteId(routeId);
  return vehicles.filter(
    (vehicle) => vehicle.routeId === routeId || vehicle.rawRouteId === routeId || vehicle.routeId === line?.id,
  );
}

export function gpsBusLines() {
  return BAHIA_BLANCA_LINES.map(({ id, name, shortName, rawRouteId }) => ({
    id,
    name,
    shortName,
    rawRouteId,
  }));
}
