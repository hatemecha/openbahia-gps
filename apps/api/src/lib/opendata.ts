import {
  parseTravelDirection,
  type StaticTransitProvider,
  type TransitLine,
  type TransitRoute,
  type TransitStop,
} from '@openbahia/transit-core';

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => cell.trim().length > 0));
}

function parseWktLineString(wkt: string): Array<{ latitude: number; longitude: number }> {
  const match = wkt.match(/LINESTRING\s*\((.+)\)/i);
  if (!match?.[1]) {
    return [];
  }
  return match[1]
    .split(',')
    .map((pair) => {
      const parts = pair.trim().split(/\s+/);
      const longitude = Number(parts[0]);
      const latitude = Number(parts[1]);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }
      return { latitude, longitude };
    })
    .filter((point): point is { latitude: number; longitude: number } => point !== null);
}

function parseRouteName(name: string): { lineId: string; direction: TransitRoute['direction']; branch?: string } {
  const match = name.match(/^(\d+[A-Za-z-]*)\s+(Ida|Vuelta)\b/i);
  if (!match?.[1] || !match[2]) {
    return { lineId: name, direction: 'unknown' };
  }
  return {
    lineId: match[1],
    direction: parseTravelDirection(match[2]),
  };
}

export function parseMunicipalRouteCsv(text: string, source = 'bahia-opendata'): TransitRoute[] {
  const rows = parseCsvRows(text);
  const header = rows[0]?.map((cell) => cell.trim().toLowerCase()) ?? [];
  const nameIndex = header.findIndex((cell) => cell === 'name');
  const wktIndex = header.findIndex((cell) => cell === 'wkt');
  if (nameIndex < 0 || wktIndex < 0) {
    return [];
  }
  const routes: TransitRoute[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const name = row?.[nameIndex]?.trim();
    const wkt = row?.[wktIndex];
    if (!name || !wkt) {
      continue;
    }
    const path = parseWktLineString(wkt);
    if (path.length < 2) {
      continue;
    }
    const parsed = parseRouteName(name);
    routes.push({
      id: `opendata-${parsed.lineId}-${parsed.direction}-${i}`,
      lineId: parsed.lineId,
      name,
      direction: parsed.direction,
      path,
      source,
    });
  }
  return routes;
}

export class BahiaOpenDataProvider implements StaticTransitProvider {
  readonly id = 'bahia-opendata';
  constructor(
    private readonly csvUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly userAgent = 'OpenBahiaTransit/0.1',
  ) {}

  async getLines(): Promise<TransitLine[]> {
    const routes = await this.getRoutes();
    const seen = new Map<string, TransitLine>();
    for (const route of routes) {
      if (!seen.has(route.lineId)) {
        seen.set(route.lineId, {
          id: route.lineId,
          name: route.lineId,
          hasRoutes: true,
          hasRealtime: false,
        });
      }
    }
    return [...seen.values()];
  }

  async getRoutes(options?: { lineId?: string }): Promise<TransitRoute[]> {
    const response = await this.fetchImpl(this.csvUrl, {
      headers: { 'user-agent': this.userAgent, accept: 'text/csv' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error('public endpoint unavailable');
    }
    const routes = parseMunicipalRouteCsv(await response.text());
    return options?.lineId ? routes.filter((route) => route.lineId === options.lineId) : routes;
  }

  async getStops(): Promise<TransitStop[]> {
    return [];
  }
}

export const BAHIA_COLECTIVOS_CSV_URL =
  'https://datos.bahia.gob.ar/dataset/76290003-71c7-4c00-adea-70f0486edbfd/resource/daa3be2e-e46f-45d5-b3fe-8063c4104470/download/recorrido-de-colectivos.csv';
