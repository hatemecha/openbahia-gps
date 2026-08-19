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
    return asRecord(history[history.length - 1]);
  }
  if (history && typeof history === 'object') {
    const values = Object.values(history as Record<string, unknown>);
    return asRecord(values[values.length - 1]);
  }
  return asRecord(record);
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
      const last = lastHistoryState(bus);
      if (!last) {
        continue;
      }
      const position = parseLatLng(last.position);
      if (!position) {
        continue;
      }
      const observedAt = parseTimestampToIso(last.date, Date.parse(receivedAt));
      if (!observedAt) {
        continue;
      }
      const bearingRaw =
        typeof last.angle === 'number'
          ? last.angle
          : typeof last.angle === 'string'
            ? Number(last.angle)
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
