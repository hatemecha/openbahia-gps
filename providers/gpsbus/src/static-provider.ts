import type { StaticTransitProvider, TransitLine, TransitRoute, TransitStop } from '@openbahia/transit-core';
import {
  firebaseStorageMediaUrl,
  gpsBusStaticLines,
  latestStorageVersion,
  parseGpsBusRoutes,
  parseGpsBusStops,
} from './parse-static.js';

export interface GpsBusStaticProviderOptions {
  bucket?: string;
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

export class GpsBusStaticProvider implements StaticTransitProvider {
  readonly id = 'gpsbus';
  private readonly bucket: string;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  private routes: TransitRoute[] = [];
  private stops: TransitStop[] = [];
  private lines: TransitLine[] = [];
  private version: string | null = null;

  constructor(options: GpsBusStaticProviderOptions = {}) {
    this.bucket = options.bucket ?? 'gps-bus-7811f.appspot.com';
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent ?? 'OpenBahiaTransit/0.1';
  }

  getVersion(): string | null {
    return this.version;
  }

  async load(): Promise<void> {
    const routeVersions = await this.fetchJson('api/routes/versions.json');
    const routeSpec = latestStorageVersion(routeVersions, 'routes');
    if (!routeSpec) {
      throw new Error('public endpoint unavailable');
    }
    const routesRaw = await this.fetchJson(`api/routes/v${routeSpec.format}/routes.${routeSpec.version}.json`);
    this.routes = parseGpsBusRoutes(routesRaw);
    this.lines = gpsBusStaticLines(this.routes);
    this.version = `routes-v${routeSpec.format}.${routeSpec.version}`;
    try {
      const stopVersions = await this.fetchJson('api/stops/versions.json');
      const stopSpec = latestStorageVersion(stopVersions, 'stops');
      if (stopSpec) {
        const stopsRaw = await this.fetchJson(`api/stops/v${stopSpec.format}/stops.${stopSpec.version}.json`);
        this.stops = parseGpsBusStops(stopsRaw);
        this.version += `+stops-v${stopSpec.format}.${stopSpec.version}`;
      }
    } catch {
      this.stops = [];
    }
  }

  async getLines(): Promise<TransitLine[]> {
    if (this.lines.length === 0) {
      await this.load();
    }
    return this.lines;
  }

  async getRoutes(options?: { lineId?: string }): Promise<TransitRoute[]> {
    if (this.routes.length === 0) {
      await this.load();
    }
    return options?.lineId ? this.routes.filter((route) => route.lineId === options.lineId) : this.routes;
  }

  async getStops(options?: { lineId?: string; routeId?: string }): Promise<TransitStop[]> {
    if (this.stops.length === 0 && this.routes.length === 0) {
      await this.load();
    }
    if (options?.routeId) {
      return this.stops.filter((stop) => stop.routeIds.includes(options.routeId!));
    }
    if (options?.lineId) {
      const ids = new Set(
        this.routes.filter((route) => route.lineId === options.lineId).map((route) => route.id),
      );
      return this.stops.filter((stop) => stop.routeIds.some((id) => ids.has(id)));
    }
    return this.stops;
  }

  private async fetchJson(objectPath: string): Promise<unknown> {
    const response = await this.fetchImpl(firebaseStorageMediaUrl(this.bucket, objectPath), {
      headers: { 'user-agent': this.userAgent, accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error('public endpoint unavailable');
    }
    return response.json();
  }
}
