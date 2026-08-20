import {
  isValidLatitude,
  isValidLongitude,
  lineByRawRouteId,
  parseTravelDirection,
  resolveRouteId,
  type CatalogLine,
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

function parseLatLngPair(value: string): { latitude: number; longitude: number } | null {
  const comma = value.indexOf(',');
  if (comma <= 0) {
    return null;
  }
  const latitude = Number(value.slice(0, comma));
  const longitude = Number(value.slice(comma + 1));
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return null;
  }
  return { latitude, longitude };
}

export interface HomepageLineOption {
  rawId: string;
  name: string;
  recorridos: unknown;
}

export function parseHomepageLineOptions(html: string): HomepageLineOption[] {
  const pattern =
    /<option\s+value="([^"]*)"[^>]*data-recorridos='(.*?)'[^>]*>([^<]*)<\/option>/gs;
  const seen = new Set<string>();
  const options: HomepageLineOption[] = [];
  for (const match of html.matchAll(pattern)) {
    const rawId = match[1]?.trim();
    const payload = match[2];
    const name = match[3]?.trim();
    if (!rawId || !payload || !name || seen.has(rawId)) {
      continue;
    }
    seen.add(rawId);
    try {
      options.push({ rawId, name, recorridos: JSON.parse(payload) as unknown });
    } catch {
      continue;
    }
  }
  return options;
}

export function parseGpsBahiaRoutes(html: string, source = 'gpsbahia'): TransitRoute[] {
  const options = parseHomepageLineOptions(html);
  const routes: TransitRoute[] = [];
  for (const option of options) {
    const line = resolveRouteId(option.name) ?? lineByRawRouteId(option.rawId);
    const lineId = line?.id ?? option.name;
    const rows = Array.isArray(option.recorridos) ? option.recorridos : [];
    for (const row of rows) {
      const record = asRecord(row);
      if (!record) {
        continue;
      }
      const rawPath = typeof record.path === 'string' ? safeJson(record.path) : record.path;
      const points = Array.isArray(rawPath)
        ? rawPath
            .map((item) => (typeof item === 'string' ? parseLatLngPair(item) : null))
            .filter((item): item is { latitude: number; longitude: number } => item !== null)
        : [];
      if (points.length < 2) {
        continue;
      }
      const id = asString(record.Id) ?? asString(record.id);
      if (!id) {
        continue;
      }
      const direction = parseTravelDirection(asString(record.tipo));
      routes.push({
        id: `gb-${id}`,
        lineId,
        name: option.name,
        direction,
        path: points,
        source,
      });
    }
  }
  return routes;
}

export function parseGpsBahiaLinesFromHtml(html: string): TransitLine[] {
  const options = parseHomepageLineOptions(html);
  return options.map((option) => {
    const known = resolveRouteId(option.name) ?? lineByRawRouteId(option.rawId);
    return {
      id: known?.id ?? option.name,
      name: option.name,
      shortName: known?.shortName ?? option.name,
      rawRouteId: option.rawId,
      hasRealtime: true,
    };
  });
}

function normalizeLineToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Homepage catalog is the primary public-line → rawRouteId mapping.
 * The hardcoded Bahia catalog is fallback/aliases only.
 */
export function resolveCurrentGpsBahiaLine(
  publicLine: string,
  html: string | null | undefined,
): CatalogLine | undefined {
  const fallback = resolveRouteId(publicLine);
  if (!html) {
    return fallback;
  }
  const fromHome = parseGpsBahiaLinesFromHtml(html);
  const needle = normalizeLineToken(publicLine);
  const hit =
    fromHome.find((line) => normalizeLineToken(line.id) === needle) ??
    fromHome.find((line) => normalizeLineToken(line.name) === needle) ??
    fromHome.find((line) =>
      line.shortName ? normalizeLineToken(line.shortName) === needle : false,
    ) ??
    fromHome.find((line) => line.rawRouteId === publicLine);
  if (!hit?.rawRouteId) {
    return fallback;
  }
  return {
    id: hit.id,
    name: hit.name,
    shortName: hit.shortName ?? hit.name,
    rawRouteId: hit.rawRouteId,
  };
}

export function parseGpsBahiaStops(
  raw: unknown,
  routes: TransitRoute[],
  source = 'gpsbahia',
): TransitStop[] {
  const record = asRecord(raw);
  const rows = Array.isArray(record?.paradas) ? record.paradas : Array.isArray(raw) ? raw : [];
  const byLineDirection = new Map<string, string[]>();
  for (const route of routes) {
    const line = resolveRouteId(route.lineId);
    const key = `${line?.rawRouteId ?? route.lineId}:${route.direction}`;
    const current = byLineDirection.get(key) ?? [];
    current.push(route.id);
    byLineDirection.set(key, current);
  }
  const stops: TransitStop[] = [];
  for (const row of rows) {
    const item = asRecord(row);
    if (!item) {
      continue;
    }
    const id = asString(item.Id) ?? asString(item.id_parada);
    if (!id) {
      continue;
    }
    const latLngRaw = typeof item.latLng === 'string' ? safeJson(item.latLng) : item.latLng;
    const coords = asRecord(latLngRaw);
    const latitude = typeof coords?.lat === 'number' ? coords.lat : Number(coords?.lat);
    const longitude = typeof coords?.lng === 'number' ? coords.lng : Number(coords?.lng);
    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      continue;
    }
    const lineasRaw = typeof item.lineas === 'string' ? safeJson(item.lineas) : item.lineas;
    const routeIds = new Set<string>();
    if (Array.isArray(lineasRaw)) {
      for (const linea of lineasRaw) {
        const entry = asRecord(linea);
        if (!entry) {
          continue;
        }
        const rawLineId = asString(entry.linea_id);
        const direction = parseTravelDirection(asString(entry.sentido));
        if (!rawLineId) {
          continue;
        }
        const mapped = byLineDirection.get(`${rawLineId}:${direction}`) ?? [];
        for (const routeId of mapped) {
          routeIds.add(routeId);
        }
      }
    }
    const name = asString(item.nombre) ?? undefined;
    stops.push({
      id: `stop-${id}`,
      name,
      latitude,
      longitude,
      routeIds: [...routeIds],
      source,
    });
  }
  return stops;
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
