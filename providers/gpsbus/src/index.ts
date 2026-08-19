import {
  type GetVehiclesOptions,
  type ProviderAvailability,
  type RealtimeProvider,
  type TransitLine,
  type VehiclePosition,
} from '@openbahia/transit-core';
import { filterVehicles, gpsBusLines, parseGpsBusSnapshot } from './parse.js';

export interface GpsBusProviderOptions {
  databaseUrl?: string;
  cityKey?: string;
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

const UNAVAILABLE = 'public endpoint unavailable';

export class GpsBusProvider implements RealtimeProvider {
  readonly id = 'gpsbus';
  private readonly databaseUrl: string;
  private readonly cityKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  private lastError: string | null = null;

  constructor(options: GpsBusProviderOptions = {}) {
    this.databaseUrl = (options.databaseUrl ?? 'https://gps-bus-7811f-default-rtdb.firebaseio.com').replace(
      /\/$/,
      '',
    );
    this.cityKey = options.cityKey ?? 'bhi';
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent ?? 'OpenBahiaTransit/0.1';
  }

  async isAvailable(): Promise<boolean> {
    const availability = await this.getAvailability();
    return availability.available;
  }

  async getAvailability(): Promise<ProviderAvailability> {
    try {
      const response = await this.fetchImpl(
        `${this.databaseUrl}/buses/${this.cityKey}.json?shallow=true`,
        {
          headers: { 'user-agent': this.userAgent },
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!response.ok) {
        this.lastError = `HTTP ${response.status}`;
        return { available: false, reason: UNAVAILABLE };
      }
      const body = await response.json();
      if (body === null) {
        this.lastError = 'empty firebase node';
        return { available: false, reason: UNAVAILABLE };
      }
      this.lastError = null;
      return { available: true };
    } catch {
      this.lastError = UNAVAILABLE;
      return { available: false, reason: UNAVAILABLE };
    }
  }

  async getLines(): Promise<TransitLine[]> {
    return gpsBusLines();
  }

  async getVehicles(options?: GetVehiclesOptions): Promise<VehiclePosition[]> {
    const url = options?.routeId
      ? this.vehiclesUrlForRoute(options.routeId)
      : `${this.databaseUrl}/buses/${this.cityKey}.json`;
    const response = await this.fetchImpl(url, {
      headers: { 'user-agent': this.userAgent },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`gpsbus HTTP ${response.status}`);
    }
    const raw = await response.json();
    const receivedAt = new Date().toISOString();
    if (options?.routeId && !this.isCitySnapshot(raw)) {
      const wrapped = { [this.rawRouteId(options.routeId)]: raw };
      return filterVehicles(parseGpsBusSnapshot(wrapped, { receivedAt, source: this.id }), options.routeId);
    }
    const parsed = parseGpsBusSnapshot(raw, {
      receivedAt,
      source: this.id,
    });
    return filterVehicles(parsed, options?.routeId);
  }

  getLastError(): string | null {
    return this.lastError;
  }

  private vehiclesUrlForRoute(routeId: string): string {
    return `${this.databaseUrl}/buses/${this.cityKey}/${this.rawRouteId(routeId)}.json`;
  }

  private rawRouteId(routeId: string): string {
    const line = gpsBusLines().find((item) => item.id === routeId || item.rawRouteId === routeId);
    return line?.rawRouteId ?? routeId;
  }

  private isCitySnapshot(raw: unknown): boolean {
    return Boolean(raw && typeof raw === 'object' && !Array.isArray(raw) && 'bhi' in (raw as object));
  }
}

export { GpsBusStaticProvider } from './static-provider.js';
export { latestStorageVersion, parseGpsBusRoutes, parseGpsBusStops } from './parse-static.js';
