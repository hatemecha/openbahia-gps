import {
  assertNever,
  type GetVehiclesOptions,
  type ProviderAvailability,
  type RealtimeProvider,
  type TransitLine,
  type VehiclePosition,
} from '@openbahia/transit-core';
import {
  classifyGpsBahiaTrack,
  gpsBahiaLines,
  parseGpsBahiaTrackPayload,
} from './parse.js';
import { parseGpsBahiaLinesFromHtml, resolveCurrentGpsBahiaLine } from './parse-static.js';
import { GPSBAHIA_UNAVAILABLE, GpsBahiaSessionManager } from './session.js';

export interface GpsBahiaProviderOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  userAgent?: string;
  defaultRouteId?: string;
  session?: GpsBahiaSessionManager;
}

export class GpsBahiaProvider implements RealtimeProvider {
  readonly id = 'gpsbahia';
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  private readonly defaultRouteId: string;
  private readonly sessions: GpsBahiaSessionManager;
  private lastError: string | null = null;
  private lastSuccessAt: number | null = null;

  constructor(options: GpsBahiaProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://www.gpsbahia.com.ar/').replace(/\/?$/, '/');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent ?? 'OpenBahiaTransit/0.1';
    this.defaultRouteId = options.defaultRouteId ?? '503';
    this.sessions =
      options.session ??
      new GpsBahiaSessionManager({
        baseUrl: this.baseUrl,
        fetchImpl: this.fetchImpl,
        userAgent: this.userAgent,
      });
  }

  getSessionManager(): GpsBahiaSessionManager {
    return this.sessions;
  }

  async isAvailable(): Promise<boolean> {
    return (await this.getAvailability()).available;
  }

  async getAvailability(): Promise<ProviderAvailability> {
    if (this.lastSuccessAt) {
      return { available: true };
    }
    if (this.lastError) {
      return { available: false, reason: this.lastError };
    }
    return { available: false, reason: 'still starting' };
  }

  async getLines(): Promise<TransitLine[]> {
    try {
      await this.sessions.getSession();
    } catch {
      return gpsBahiaLines();
    }
    const html = this.sessions.getLastHtml();
    const parsed = html ? parseGpsBahiaLinesFromHtml(html) : [];
    return parsed.length > 0 ? parsed : gpsBahiaLines();
  }

  async getVehicles(options?: GetVehiclesOptions): Promise<VehiclePosition[]> {
    const requested = options?.lineId ?? options?.routeId ?? this.defaultRouteId;
    try {
      await this.sessions.getSession();
    } catch {
      // fetchTrack will surface the same session failure.
    }
    const line = resolveCurrentGpsBahiaLine(requested, this.sessions.getLastHtml());
    const rawRouteId = line?.rawRouteId ?? requested;
    const payload = await this.fetchTrack(rawRouteId);
    const vehicles = parseGpsBahiaTrackPayload(payload, {
      routeId: line?.id ?? requested,
      rawRouteId,
      receivedAt: new Date().toISOString(),
      source: this.id,
    });
    this.lastError = null;
    this.lastSuccessAt = Date.now();
    return vehicles;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  private async fetchTrack(rawRouteId: string, retried = false): Promise<unknown> {
    const session = await this.sessions.getSession();
    const url = `${this.baseUrl}app/track_data/${encodeURIComponent(rawRouteId)}.json?vggaxqq=${session.token}`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        'user-agent': this.userAgent,
        cookie: session.cookie,
        referer: this.baseUrl,
        origin: this.baseUrl.replace(/\/$/, ''),
        'x-requested-with': 'XMLHttpRequest',
        accept: 'application/json, text/javascript, */*; q=0.01',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      this.lastError = GPSBAHIA_UNAVAILABLE;
      throw new Error(GPSBAHIA_UNAVAILABLE);
    }
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      this.lastError = GPSBAHIA_UNAVAILABLE;
      throw new Error(GPSBAHIA_UNAVAILABLE);
    }
    const kind = classifyGpsBahiaTrack(raw);
    switch (kind) {
      case 'invalid-token':
      case 'invalid-session':
        this.sessions.invalidate();
        if (!retried) {
          return this.fetchTrack(rawRouteId, true);
        }
        this.lastError = GPSBAHIA_UNAVAILABLE;
        throw new Error(GPSBAHIA_UNAVAILABLE);
      case 'error':
        this.lastError = GPSBAHIA_UNAVAILABLE;
        throw new Error(GPSBAHIA_UNAVAILABLE);
      case 'empty':
      case 'vehicles':
        return raw;
      default:
        return assertNever(kind);
    }
  }
}

export { GpsBahiaSessionManager } from './session.js';
export { GpsBahiaStaticProvider } from './static-provider.js';
export {
  classifyGpsBahiaTrack,
  cookieHeaderFromSetCookie,
  extractPublicPageToken,
  parseGpsBahiaTrackPayload,
} from './parse.js';
export { parseGpsBahiaRoutes, parseGpsBahiaStops, parseHomepageLineOptions, resolveCurrentGpsBahiaLine } from './parse-static.js';
export { observedTrackRowLineId } from './parse.js';
