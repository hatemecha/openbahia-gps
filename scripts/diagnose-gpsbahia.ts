import { haversineMeters, lineById } from '../packages/transit-core/src/index.ts';
import {
  GpsBahiaProvider,
  parseGpsBahiaTrackPayload,
  parseHomepageLineOptions,
  resolveCurrentGpsBahiaLine,
} from '../providers/gpsbahia/src/index.ts';

function argValue(flag: string): string | undefined {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(flag);
  if (index >= 0) {
    return argv[index + 1];
  }
  const prefixed = argv.find((item) => item.startsWith(`${flag}=`));
  return prefixed?.slice(flag.length + 1);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

function ageSeconds(iso: string | null, nowMs: number): number | null {
  if (!iso) {
    return null;
  }
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.max(0, Math.round((nowMs - parsed) / 1000));
}

async function main(): Promise<void> {
  const publicLine = argValue('--line') ?? '513';
  const hardcoded = lineById(publicLine);
  const provider = new GpsBahiaProvider();
  const sessions = provider.getSessionManager();
  const homepage = await sessions.fetchHomepage();
  const homepageOptions = parseHomepageLineOptions(homepage.html);
  const resolved = resolveCurrentGpsBahiaLine(publicLine, homepage.html);
  const homepageRaw =
    homepageOptions.find((option) => option.name.trim() === publicLine)?.rawId ??
    homepageOptions.find((option) => option.rawId === publicLine)?.rawId ??
    null;
  const requestedRaw = resolved?.rawRouteId ?? hardcoded?.rawRouteId ?? publicLine;
  const match = hardcoded?.rawRouteId === homepageRaw ? 'YES' : homepageRaw ? 'NO' : 'NO HOME PAGE HIT';

  console.log(`PUBLIC LINE: ${publicLine}`);
  console.log(`RAW ROUTE ID REQUESTED: ${requestedRaw}`);
  console.log(`RAW ROUTE ID FROM CURRENT GPSBAHIA HOMEPAGE: ${homepageRaw ?? '—'}`);
  console.log(`HARDCODED FALLBACK RAW ROUTE ID: ${hardcoded?.rawRouteId ?? '—'}`);
  console.log(`MATCH: ${match}`);
  console.log('');

  const vehicles = await provider.getVehicles({ lineId: publicLine });
  const trackUrl = `${sessions.homepageUrl}app/track_data/${encodeURIComponent(requestedRaw)}.json`;
  const session = await sessions.getSession();
  const response = await fetch(`${trackUrl}?vggaxqq=${session.token}`, {
    method: 'POST',
    headers: {
      'user-agent': 'OpenBahiaTransit/0.1-diagnose',
      cookie: session.cookie,
      referer: sessions.homepageUrl,
      origin: sessions.homepageUrl.replace(/\/$/, ''),
      'x-requested-with': 'XMLHttpRequest',
      accept: 'application/json, text/javascript, */*; q=0.01',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`track_data HTTP ${response.status}`);
  }
  const rawPayload: unknown = await response.json();
  const record = asRecord(rawPayload);
  const rows = Array.isArray(record?.data) ? record.data : [];
  const nowMs = Date.now();
  const parsed = parseGpsBahiaTrackPayload(rawPayload, {
    routeId: resolved?.id ?? publicLine,
    rawRouteId: requestedRaw,
    receivedAt: new Date(nowMs).toISOString(),
    source: 'gpsbahia',
  });
  const parsedById = new Map(parsed.map((vehicle) => [vehicle.vehicleId, vehicle]));

  const firstRow = asRecord(rows[0]);
  if (firstRow) {
    const identityKeys = Object.keys(firstRow).filter((key) =>
      ['linea_id', 'line_id', 'route_id', 'linea', 'route'].includes(key.toLowerCase()),
    );
    console.log(`RAW ROW KEYS: ${Object.keys(firstRow).join(', ')}`);
    console.log(
      `RAW ROW LINE IDENTITY FIELDS: ${identityKeys.length ? identityKeys.join(', ') : '(none observed)'}`,
    );
    console.log('');
  } else {
    console.log('RAW ROW KEYS: (empty payload)');
    console.log('');
  }

  console.log('RAW UNITS');
  console.log(
    ['vehicleId', 'imei', 'rawLat', 'rawLng', 'direccion', 'dt_tracker', 'dt_server', 'ageSeconds'].join('\t'),
  );
  for (const row of rows) {
    const item = asRecord(row);
    if (!item) {
      continue;
    }
    const vehicleId = asString(item.interno) ?? asString(item.name) ?? asString(item.imei) ?? '—';
    const lat = asNumber(item.lat);
    const lng = asNumber(item.lng);
    const tracker = asString(item.dt_tracker);
    const server = asString(item.dt_server);
    const trackerIso = tracker ? tracker.replace(' ', 'T') + (tracker.endsWith('Z') ? '' : 'Z') : null;
    console.log(
      [
        vehicleId,
        asString(item.imei) ?? '—',
        lat ?? '—',
        lng ?? '—',
        asString(item.direccion) ?? '—',
        tracker ?? '—',
        server ?? '—',
        ageSeconds(trackerIso, nowMs) ?? '—',
      ].join('\t'),
    );
  }

  console.log('');
  console.log('PARSED UNITS');
  console.log(
    [
      'vehicleId',
      'parsedLat',
      'parsedLng',
      'parsedLineId',
      'parsedDirection',
      'deltaRawToParsedMeters',
    ].join('\t'),
  );
  let maxDelta = 0;
  for (const row of rows) {
    const item = asRecord(row);
    if (!item) {
      continue;
    }
    const vehicleId = asString(item.interno) ?? asString(item.name) ?? asString(item.imei);
    if (!vehicleId) {
      continue;
    }
    const rawLat = asNumber(item.lat);
    const rawLng = asNumber(item.lng);
    const parsedVehicle = parsedById.get(vehicleId);
    const delta =
      parsedVehicle && rawLat !== null && rawLng !== null
        ? haversineMeters(
            { latitude: rawLat, longitude: rawLng },
            { latitude: parsedVehicle.latitude, longitude: parsedVehicle.longitude },
          )
        : null;
    if (delta !== null) {
      maxDelta = Math.max(maxDelta, delta);
    }
    console.log(
      [
        vehicleId,
        parsedVehicle?.latitude ?? 'DROPPED',
        parsedVehicle?.longitude ?? 'DROPPED',
        parsedVehicle?.lineId ?? '—',
        parsedVehicle?.direction ?? '—',
        delta === null ? '—' : delta.toFixed(3),
      ].join('\t'),
    );
  }

  console.log('');
  console.log(`RAW ROWS: ${rows.length}`);
  console.log(`PARSED VEHICLES: ${parsed.length}`);
  console.log(`PROVIDER VEHICLES: ${vehicles.length}`);
  console.log(`MAX RAW→PARSED DELTA M: ${maxDelta.toFixed(3)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
