import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page, Request, Response } from 'playwright';
import { haversineMeters } from '../packages/transit-core/src/index.ts';

const requireFromApi = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../apps/api/package.json'));
const { chromium } = requireFromApi('playwright') as typeof import('playwright');

export const GPSBAHIA_URL = 'https://www.gpsbahia.com.ar/';
export const PROBE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../tmp/gpsbahia-probe');

const RELEVANT_RESOURCE = new Set(['document', 'script', 'xhr', 'fetch']);
const MAX_BODY_CHARS = 200_000;
const FIRST_PARTY_HOST = 'www.gpsbahia.com.ar';
const JS_KEYWORDS = [
  'track_data',
  'get_track_data',
  'setLatLng',
  'marker',
  'interno',
  'imei',
  'direccion',
  'lat',
  'lng',
  'frecuencia',
  'recorrido',
  'linea',
  'vgggaxqq',
  'vggaxqq',
  'render_tracks',
  'L.marker',
];

export type MarkerKind = 'bus' | 'frequency' | 'stop' | 'user' | 'other';

export interface CapturedRequest {
  atMs: number;
  method: string;
  url: string;
  resourceType: string;
  postData: string | null;
  requestContentType: string | null;
}

export interface CapturedResponse {
  atMs: number;
  method: string;
  url: string;
  resourceType: string;
  status: number;
  contentType: string | null;
  body: string | null;
}

export interface LeafletMarkerRecord {
  leafletId: number | null;
  event: string;
  lat: number | null;
  lng: number | null;
  iconUrl: string | null;
  iconClass: string | null;
  title: string | null;
  interno: string | number | null;
  frecuencia_id: string | number | null;
  parada_id: string | number | null;
  popup: string | null;
  tooltip: string | null;
  timestamp: number;
}

export interface OfficialBusMarker {
  markerId: string;
  lat: number;
  lng: number;
  icon: string | null;
  interno: string | null;
  popup: string | null;
  kind: MarkerKind;
}

export interface LineIdentity {
  displayed: string;
  optionValue: string;
  optionText: string;
}

export interface CoordHit {
  url: string;
  path: string;
  lat: number;
  lng: number;
}

export interface MarkerCorrelation {
  marker: OfficialBusMarker;
  nearest: { url: string; path: string; lat: number; lng: number; deltaM: number } | null;
}

export interface OfficialCapture {
  line: string;
  capturedAt: string;
  lineIdentity: LineIdentity | null;
  screenshotPath: string;
  network: { requests: CapturedRequest[]; responses: CapturedResponse[] };
  leafletRecords: LeafletMarkerRecord[];
  officialBusMarkers: OfficialBusMarker[];
  frequencyMarkersOff: OfficialBusMarker[];
  frequencyMarkersOn: OfficialBusMarker[];
  stopMarkers: OfficialBusMarker[];
  jsFindingsPath: string;
  correlation: MarkerCorrelation[];
  busIconEvidence: string[];
  frequencyIconEvidence: string[];
  lastTrackPayload: unknown;
  lastTrackUrl: string | null;
}

export interface OfficialBusSnapshot {
  buses: OfficialBusMarker[];
  lineIdentity: LineIdentity | null;
  lastTrackPayload: unknown;
  lastTrackUrl: string | null;
}

function argValue(flag: string, argv = process.argv.slice(2)): string | undefined {
  const index = argv.indexOf(flag);
  if (index >= 0) {
    return argv[index + 1];
  }
  const prefixed = argv.find((item) => item.startsWith(`${flag}=`));
  return prefixed?.slice(flag.length + 1);
}

export function probeArgs(argv = process.argv.slice(2)): { line: string; headed: boolean } {
  return {
    line: argValue('--line', argv) ?? '513',
    headed: argv.includes('--headed') || process.env.GPSBAHIA_PROBE_HEADED === '1',
  };
}

export function redactText(value: string): string {
  return value
    .replace(/vgggaxqq\s*=\s*'[a-f0-9]+'/gi, "vgggaxqq = 'REDACTED'")
    .replace(/vggaxqq=[a-f0-9]+/gi, 'vggaxqq=REDACTED')
    .replace(/vgggaxqq=[a-f0-9]+/gi, 'vgggaxqq=REDACTED')
    .replace(/ci_session=[^;]+/gi, 'ci_session=REDACTED')
    .replace(/"(token|hash|cookie|ci_session)"\s*:\s*"[^"]*"/gi, '"$1":"REDACTED"');
}

function redactUrl(url: string): string {
  return redactText(url);
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

function classifyMarker(record: Pick<LeafletMarkerRecord, 'iconUrl' | 'interno' | 'frecuencia_id' | 'parada_id' | 'popup'>): MarkerKind {
  const url = (record.iconUrl ?? '').toLowerCase();
  const popup = String(record.popup ?? '');
  if (record.interno != null || url.includes('/markers/micro-') || /interno\s*:/i.test(popup)) {
    return 'bus';
  }
  if (record.frecuencia_id != null || url.includes('clock-marker') || /d[ií]as h[aá]biles/i.test(popup)) {
    return 'frequency';
  }
  if (record.parada_id != null || /pr[oó]ximo estimado/i.test(popup)) {
    return 'stop';
  }
  if (url.includes('ubicacion-marker')) {
    return 'user';
  }
  if (url.includes('map-marker.png')) {
    return 'stop';
  }
  return 'other';
}

function latestMarkers(records: LeafletMarkerRecord[], kind: MarkerKind): OfficialBusMarker[] {
  const byKey = new Map<string, OfficialBusMarker>();
  for (const record of records) {
    if (record.lat === null || record.lng === null) {
      continue;
    }
    const classified = classifyMarker(record);
    if (classified !== kind) {
      continue;
    }
    const interno = asString(record.interno);
    const key = interno ?? String(record.leafletId ?? `${record.lat},${record.lng}`);
    byKey.set(key, {
      markerId: key,
      lat: record.lat,
      lng: record.lng,
      icon: record.iconUrl,
      interno,
      popup: typeof record.popup === 'string' ? record.popup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null,
      kind,
    });
  }
  return [...byKey.values()];
}

function extractCoords(value: unknown, path: string, url: string, out: CoordHit[]): void {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length < 20_000) {
      try {
        extractCoords(JSON.parse(trimmed) as unknown, `${path}(json)`, url, out);
      } catch {
        const nums = trimmed.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
        if (nums.length >= 2 && Math.abs(nums[0]!) > 1 && Math.abs(nums[1]!) > 1) {
          out.push({ url, path, lat: nums[0]!, lng: nums[1]! });
        }
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => extractCoords(item, `${path}[${index}]`, url, out));
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  const rec = value as Record<string, unknown>;
  const lat = asNumber(rec.lat ?? rec.latitude ?? rec.Lat ?? rec.LAT);
  const lng = asNumber(rec.lng ?? rec.lon ?? rec.longitude ?? rec.Lng ?? rec.LON);
  if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && Math.abs(lat) > 1 && Math.abs(lng) > 1) {
    out.push({ url, path, lat, lng });
  }
  for (const [key, child] of Object.entries(rec)) {
    extractCoords(child, `${path}.${key}`, url, out);
  }
}

function correlate(markers: OfficialBusMarker[], responses: CapturedResponse[]): MarkerCorrelation[] {
  const hits: CoordHit[] = [];
  for (const response of responses) {
    if (!response.body) {
      continue;
    }
    try {
      extractCoords(JSON.parse(response.body) as unknown, '$', redactUrl(response.url), hits);
    } catch {
      extractCoords(response.body, '$', redactUrl(response.url), hits);
    }
  }
  return markers.map((marker) => {
    let nearest: MarkerCorrelation['nearest'] = null;
    for (const hit of hits) {
      const deltaM = haversineMeters(
        { latitude: marker.lat, longitude: marker.lng },
        { latitude: hit.lat, longitude: hit.lng },
      );
      if (!nearest || deltaM < nearest.deltaM) {
        nearest = { url: hit.url, path: hit.path, lat: hit.lat, lng: hit.lng, deltaM };
      }
    }
    return { marker, nearest };
  });
}

const LEAFLET_HOOK = `(() => {
  const records = [];
  window.__gpsBahiaMarkers = records;
  window.__gpsBahiaHooked = false;
  function iconUrlOf(marker) {
    try { return marker?.options?.icon?.options?.iconUrl ?? null; } catch { return null; }
  }
  function snapshot(marker, event) {
    let lat = null, lng = null;
    try {
      const ll = marker.getLatLng && marker.getLatLng();
      if (ll) { lat = ll.lat; lng = ll.lng; }
    } catch {}
    records.push({
      leafletId: marker._leaflet_id ?? null,
      event,
      lat,
      lng,
      iconUrl: iconUrlOf(marker),
      iconClass: marker?.options?.icon?.options?.className ?? null,
      title: marker?.options?.title ?? null,
      interno: marker?.options?.interno ?? null,
      frecuencia_id: marker?.options?.frecuencia_id ?? null,
      parada_id: marker?.options?.parada_id ?? null,
      popup: marker?._popup?._content ?? null,
      tooltip: marker?._tooltip?._content ?? null,
      timestamp: Date.now()
    });
  }
  function hook() {
    if (!window.L || !window.L.Marker || window.__gpsBahiaHooked) {
      return Boolean(window.__gpsBahiaHooked);
    }
    window.__gpsBahiaHooked = true;
    const Proto = window.L.Marker.prototype;
    const origInit = Proto.initialize;
    Proto.initialize = function () {
      const ret = origInit.apply(this, arguments);
      snapshot(this, 'create');
      return ret;
    };
    const origSet = Proto.setLatLng;
    Proto.setLatLng = function (latlng) {
      const ret = origSet.call(this, latlng);
      snapshot(this, 'move');
      return ret;
    };
    const origPopup = Proto.bindPopup;
    Proto.bindPopup = function () {
      const ret = origPopup.apply(this, arguments);
      snapshot(this, 'popup');
      return ret;
    };
    const origTip = Proto.bindTooltip;
    Proto.bindTooltip = function () {
      const ret = origTip.apply(this, arguments);
      snapshot(this, 'tooltip');
      return ret;
    };
    if (typeof window.L.marker === 'function') {
      const origFactory = window.L.marker;
      window.L.marker = function () {
        const marker = origFactory.apply(this, arguments);
        snapshot(marker, 'factory');
        return marker;
      };
    }
    return true;
  }
  const timer = setInterval(() => { if (hook()) clearInterval(timer); }, 20);
})();`;

async function attachNetwork(page: Page, started: number, requests: CapturedRequest[], responses: CapturedResponse[]): Promise<void> {
  page.on('request', (request: Request) => {
    if (!RELEVANT_RESOURCE.has(request.resourceType())) {
      return;
    }
    requests.push({
      atMs: Date.now() - started,
      method: request.method(),
      url: redactUrl(request.url()),
      resourceType: request.resourceType(),
      postData: request.postData() ? redactText(request.postData() as string) : null,
      requestContentType: request.headers()['content-type'] ?? null,
    });
  });
  page.on('response', async (response: Response) => {
    const request = response.request();
    if (!RELEVANT_RESOURCE.has(request.resourceType())) {
      return;
    }
    const contentType = response.headers()['content-type'] ?? null;
    let body: string | null = null;
    const looksText =
      Boolean(contentType && /json|text|javascript|xml/i.test(contentType)) ||
      request.resourceType() === 'xhr' ||
      request.resourceType() === 'fetch';
    if (looksText) {
      try {
        const raw = await response.text();
        if (raw.length <= MAX_BODY_CHARS) {
          body = redactText(raw);
        } else {
          body = `[omitted: ${raw.length} chars]`;
        }
      } catch {
        body = null;
      }
    }
    responses.push({
      atMs: Date.now() - started,
      method: request.method(),
      url: redactUrl(response.url()),
      resourceType: request.resourceType(),
      status: response.status(),
      contentType,
      body,
    });
  });
}

async function waitForMap(page: Page): Promise<void> {
  await page.waitForSelector('#main-map', { timeout: 30_000 });
  await page.waitForFunction(() => Boolean(window.L && window.L.Marker), null, { timeout: 30_000 });
  await page.waitForTimeout(800);
}

async function dismissModals(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  const close = page.locator('.modal.show [data-dismiss="modal"], .modal.show .close').first();
  if (await close.count()) {
    await close.click({ timeout: 1500 }).catch(() => undefined);
  }
}

async function setCheckbox(page: Page, selector: string, checked: boolean): Promise<boolean> {
  const id = selector.startsWith('#') ? selector.slice(1) : null;
  const box = page.locator(selector);
  try {
    await box.waitFor({ state: 'attached', timeout: 12_000 });
  } catch {
    return false;
  }
  const isChecked = await box.isChecked();
  if (isChecked === checked) {
    return true;
  }
  if (id) {
    const label = page.locator(`label[for="${id}"]`);
    if (await label.count()) {
      await label.click();
      await page.waitForTimeout(400);
      return true;
    }
  }
  await page.evaluate(
    ({ target, value }) => {
      const el = document.querySelector<HTMLInputElement>(target);
      if (!el) {
        return;
      }
      el.checked = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { target: selector, value: checked },
  );
  await page.waitForTimeout(400);
  return true;
}

async function selectLine(page: Page, line: string): Promise<LineIdentity | null> {
  const identity = await page.evaluate((publicLine: string) => {
    const select = document.querySelector<HTMLSelectElement>('#linea_id');
    if (!select) {
      return null;
    }
    const option = [...select.options].find((item) => item.textContent?.trim() === publicLine);
    if (!option) {
      return null;
    }
    return { displayed: publicLine, optionValue: option.value, optionText: option.textContent?.trim() ?? publicLine };
  }, line);
  if (!identity) {
    throw new Error(`GPSBahia dropdown has no option whose text is ${line}`);
  }
  await page.selectOption('#linea_id', identity.optionValue);
  await page.locator('#linea_id-drawer').selectOption(identity.optionValue).catch(() => undefined);
  await page.waitForTimeout(500);
  await dismissModals(page);
  return identity;
}

async function waitForTracks(page: Page): Promise<void> {
  await page
    .waitForResponse(
      (response) => response.url().includes('/app/track_data/') && response.request().method() === 'POST',
      { timeout: 25_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(2500);
}

async function readLeafletRecords(page: Page): Promise<LeafletMarkerRecord[]> {
  return page.evaluate(() => (window as unknown as { __gpsBahiaMarkers?: LeafletMarkerRecord[] }).__gpsBahiaMarkers ?? []);
}

async function collectJsFindings(page: Page, outPath: string): Promise<void> {
  const srcs = await page.evaluate(() =>
    [...document.querySelectorAll('script[src]')].map((node) => (node as HTMLScriptElement).src),
  );
  const lines: string[] = [`capturedAt=${new Date().toISOString()}`, `scripts=${srcs.length}`, ''];
  for (const src of srcs) {
    let host = '';
    try {
      host = new URL(src).host;
    } catch {
      host = '';
    }
    if (host !== FIRST_PARTY_HOST) {
      lines.push(`SKIP vendor ${src}`);
      continue;
    }
    const response = await page.request.get(src);
    const body = await response.text();
    lines.push(`FILE ${src}`);
    lines.push(`bytes ${body.length}`);
    for (const keyword of JS_KEYWORDS) {
      const index = body.indexOf(keyword);
      if (index < 0) {
        continue;
      }
      const snippet = body.slice(Math.max(0, index - 80), index + keyword.length + 160).replace(/\s+/g, ' ');
      lines.push(`  ${keyword} @${index}: ${snippet}`);
    }
    lines.push('');
  }
  await writeFile(outPath, `${lines.join('\n')}\n`, 'utf8');
}

function lastTrackFromNetwork(responses: CapturedResponse[]): { url: string | null; payload: unknown } {
  const tracks = responses.filter((item) => item.url.includes('/app/track_data/') && item.body);
  const last = tracks.at(-1);
  if (!last?.body) {
    return { url: null, payload: null };
  }
  try {
    return { url: last.url, payload: JSON.parse(last.body) as unknown };
  } catch {
    return { url: last.url, payload: last.body };
  }
}

export async function captureOfficialGpsBahia(
  line: string,
  headed: boolean,
  options?: { onBuses?: (snapshot: OfficialBusSnapshot) => Promise<void> },
): Promise<OfficialCapture> {
  await mkdir(PROBE_DIR, { recursive: true });
  const started = Date.now();
  const requests: CapturedRequest[] = [];
  const responses: CapturedResponse[] = [];
  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('linea_id');
    } catch {
      // ignore
    }
  });
  await page.addInitScript({ content: LEAFLET_HOOK });
  await attachNetwork(page, started, requests, responses);

  try {
    await page.goto(GPSBAHIA_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForMap(page);
    await dismissModals(page);
    await setCheckbox(page, '#frecuencias-check', false);
    const lineIdentity = await selectLine(page, line);
    await setCheckbox(page, '#paradas-check', false);
    await waitForTracks(page);
    await setCheckbox(page, '#paradas-check', false);
    await setCheckbox(page, '#frecuencias-check', false);
    await page.waitForTimeout(1500);

    const screenshotPath = join(PROBE_DIR, `${line}-official.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const offRecords = await readLeafletRecords(page);
    const officialBusMarkers = latestMarkers(offRecords, 'bus');
    const frequencyMarkersOff = latestMarkers(offRecords, 'frequency');
    const stopMarkers = latestMarkers(offRecords, 'stop');
    const firstTrack = lastTrackFromNetwork(responses);
    if (options?.onBuses) {
      await options.onBuses({
        buses: officialBusMarkers,
        lineIdentity,
        lastTrackPayload: firstTrack.payload,
        lastTrackUrl: firstTrack.url,
      });
    }

    await setCheckbox(page, '#frecuencias-check', true);
    await page
      .waitForResponse((response) => response.url().includes('/web2/get_frecuencias_puntos/'), { timeout: 12_000 })
      .catch(() => undefined);
    await page.waitForTimeout(1200);
    const onRecords = await readLeafletRecords(page);
    const frequencyMarkersOn = latestMarkers(onRecords, 'frequency');
    await setCheckbox(page, '#frecuencias-check', false);

    const jsFindingsPath = join(PROBE_DIR, 'js-findings.txt');
    await collectJsFindings(page, jsFindingsPath);

    const network = { requests, responses };
    await writeFile(join(PROBE_DIR, `${line}-network.json`), `${JSON.stringify(network, null, 2)}\n`, 'utf8');
    await writeFile(join(PROBE_DIR, `${line}-markers.json`), `${JSON.stringify({ officialBusMarkers, frequencyMarkersOff, frequencyMarkersOn, stopMarkers, leafletRecords: onRecords }, null, 2)}\n`, 'utf8');

    const correlation = correlate(officialBusMarkers, responses);
    await writeFile(join(PROBE_DIR, `${line}-correlation.json`), `${JSON.stringify(correlation, null, 2)}\n`, 'utf8');

    return {
      line,
      capturedAt: new Date().toISOString(),
      lineIdentity,
      screenshotPath,
      network,
      leafletRecords: onRecords,
      officialBusMarkers,
      frequencyMarkersOff,
      frequencyMarkersOn,
      stopMarkers,
      jsFindingsPath,
      correlation,
      busIconEvidence: [...new Set(officialBusMarkers.map((item) => item.icon).filter((item): item is string => Boolean(item)))],
      frequencyIconEvidence: [
        ...new Set(frequencyMarkersOn.map((item) => item.icon).filter((item): item is string => Boolean(item))),
      ],
      lastTrackPayload: firstTrack.payload,
      lastTrackUrl: firstTrack.url,
    };
  } finally {
    await browser.close();
  }
}

export function relevantTrackRequests(capture: OfficialCapture): CapturedResponse[] {
  return capture.network.responses.filter(
    (item) =>
      item.resourceType === 'xhr' ||
      item.resourceType === 'fetch' ||
      item.url.includes('/app/') ||
      item.url.includes('/web2/'),
  );
}
