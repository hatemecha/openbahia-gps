import { haversineMeters } from '../packages/transit-core/src/index.ts';
import { GpsBahiaProvider, parseGpsBahiaTrackPayload } from '../providers/gpsbahia/src/index.ts';
import {
  captureOfficialGpsBahia,
  probeArgs,
  type OfficialBusMarker,
} from './gpsbahia-official.ts';

interface OpenBahiaVehicle {
  vehicleId: string;
  latitude: number;
  longitude: number;
  source: 'api' | 'provider' | 'track_data';
}

interface MatchRow {
  interno: string;
  officialLat: number;
  officialLng: number;
  openbahiaLat: number;
  openbahiaLng: number;
  deltaM: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function normalizeId(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

async function fetchOpenBahiaApi(line: string): Promise<OpenBahiaVehicle[] | null> {
  const apiUrl = process.env.PUBLIC_API_URL ?? 'http://127.0.0.1:3000';
  try {
    const response = await fetch(`${apiUrl}/api/vehicles?lineId=${encodeURIComponent(line)}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as {
      data?: Array<{ vehicleId: string; latitude: number; longitude: number }>;
    };
    if (!Array.isArray(payload.data)) {
      return null;
    }
    return payload.data.map((item) => ({
      vehicleId: item.vehicleId,
      latitude: item.latitude,
      longitude: item.longitude,
      source: 'api' as const,
    }));
  } catch {
    return null;
  }
}

async function fetchOpenBahiaProvider(line: string): Promise<OpenBahiaVehicle[]> {
  const provider = new GpsBahiaProvider();
  const vehicles = await provider.getVehicles({ lineId: line });
  return vehicles.map((item) => ({
    vehicleId: item.vehicleId,
    latitude: item.latitude,
    longitude: item.longitude,
    source: 'provider' as const,
  }));
}

function vehiclesFromTrackPayload(line: string, payload: unknown): OpenBahiaVehicle[] {
  const vehicles = parseGpsBahiaTrackPayload(payload, {
    routeId: line,
    receivedAt: new Date().toISOString(),
    source: 'gpsbahia',
  });
  return vehicles.map((item) => ({
    vehicleId: item.vehicleId,
    latitude: item.latitude,
    longitude: item.longitude,
    source: 'track_data' as const,
  }));
}

function matchByInterno(official: OfficialBusMarker[], openbahia: OpenBahiaVehicle[]): {
  matched: MatchRow[];
  unmatchedOfficial: OfficialBusMarker[];
  unmatchedOpenbahia: OpenBahiaVehicle[];
} {
  const remaining = [...openbahia];
  const matched: MatchRow[] = [];
  const unmatchedOfficial: OfficialBusMarker[] = [];

  for (const marker of official) {
    const id = marker.interno ? normalizeId(marker.interno) : null;
    const index = id ? remaining.findIndex((item) => normalizeId(item.vehicleId) === id) : -1;
    if (index < 0) {
      unmatchedOfficial.push(marker);
      continue;
    }
    const vehicle = remaining.splice(index, 1)[0]!;
    matched.push({
      interno: marker.interno ?? vehicle.vehicleId,
      officialLat: marker.lat,
      officialLng: marker.lng,
      openbahiaLat: vehicle.latitude,
      openbahiaLng: vehicle.longitude,
      deltaM: haversineMeters(
        { latitude: marker.lat, longitude: marker.lng },
        { latitude: vehicle.latitude, longitude: vehicle.longitude },
      ),
    });
  }

  return { matched, unmatchedOfficial, unmatchedOpenbahia: remaining };
}

function printSet(
  title: string,
  result: { matched: MatchRow[]; unmatchedOfficial: OfficialBusMarker[]; unmatchedOpenbahia: OpenBahiaVehicle[] },
  officialCount: number,
  openCount: number,
  source: string,
): void {
  const deltas = result.matched.map((item) => item.deltaM);
  console.log(title);
  console.log(`OFFICIAL: ${officialCount}`);
  console.log(`OPENBAHIA (${source}): ${openCount}`);
  console.log(`MATCHED: ${result.matched.length}`);
  console.log(`MAX DELTA: ${deltas.length ? `${Math.max(...deltas).toFixed(1)}m` : '—'}`);
  console.log(`MEDIAN DELTA: ${median(deltas) === null ? '—' : `${median(deltas)!.toFixed(1)}m`}`);
  for (const row of result.matched) {
    console.log(
      `  ${row.interno} official=${row.officialLat},${row.officialLng} openbahia=${row.openbahiaLat},${row.openbahiaLng} delta=${row.deltaM.toFixed(1)}m`,
    );
  }
  console.log('UNMATCHED OFFICIAL:');
  for (const marker of result.unmatchedOfficial) {
    console.log(`  ${marker.interno ?? marker.markerId} ${marker.lat},${marker.lng}`);
  }
  console.log('UNMATCHED OPENBAHIA:');
  for (const vehicle of result.unmatchedOpenbahia) {
    console.log(`  ${vehicle.vehicleId} ${vehicle.latitude},${vehicle.longitude}`);
  }
}

export async function compareLine(line: string, headed: boolean): Promise<{
  track: ReturnType<typeof matchByInterno>;
  provider: ReturnType<typeof matchByInterno>;
  api: ReturnType<typeof matchByInterno> | null;
  officialCount: number;
  providerCount: number;
  apiCount: number;
}> {
  let providerVehicles: OpenBahiaVehicle[] = [];
  let apiVehicles: OpenBahiaVehicle[] | null = null;
  const capture = await captureOfficialGpsBahia(line, headed, {
    onBuses: async () => {
      const [provider, api] = await Promise.all([fetchOpenBahiaProvider(line), fetchOpenBahiaApi(line)]);
      providerVehicles = provider;
      apiVehicles = api;
    },
  });
  const trackVehicles = vehiclesFromTrackPayload(line, capture.lastTrackPayload);
  return {
    officialCount: capture.officialBusMarkers.length,
    providerCount: providerVehicles.length,
    apiCount: apiVehicles?.length ?? 0,
    track: matchByInterno(capture.officialBusMarkers, trackVehicles),
    provider: matchByInterno(capture.officialBusMarkers, providerVehicles),
    api: apiVehicles ? matchByInterno(capture.officialBusMarkers, apiVehicles) : null,
  };
}

async function main(): Promise<void> {
  const { line, headed } = probeArgs();
  const result = await compareLine(line, headed);
  console.log(`LINE ${line}`);
  printSet(
    'SAME-PAYLOAD PARSER (official Leaflet vs captured track_data parsed by OpenBahía)',
    result.track,
    result.officialCount,
    result.track.matched.length + result.track.unmatchedOpenbahia.length,
    'track_data',
  );
  printSet(
    'PROVIDER (simultaneous getVehicles)',
    result.provider,
    result.officialCount,
    result.providerCount,
    'provider',
  );
  if (result.api) {
    printSet('API /api/vehicles (simultaneous GET)', result.api, result.officialCount, result.apiCount, 'api');
  } else {
    console.log('API: unavailable');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
