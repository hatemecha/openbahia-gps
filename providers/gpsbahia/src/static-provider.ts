import type { StaticTransitProvider, TransitLine, TransitRoute, TransitStop } from '@openbahia/transit-core';
import { parseGpsBahiaLinesFromHtml, parseGpsBahiaRoutes, parseGpsBahiaStops } from './parse-static.js';
import { GpsBahiaSessionManager } from './session.js';

export interface GpsBahiaStaticProviderOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  userAgent?: string;
  session?: GpsBahiaSessionManager;
}

export class GpsBahiaStaticProvider implements StaticTransitProvider {
  readonly id = 'gpsbahia';
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  private readonly session: GpsBahiaSessionManager;
  private routes: TransitRoute[] = [];
  private stops: TransitStop[] = [];
  private lines: TransitLine[] = [];
  private routesReady = false;
  private stopsReady = false;
  private routesLoad: Promise<void> | null = null;
  private stopsLoad: Promise<void> | null = null;

  constructor(options: GpsBahiaStaticProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://www.gpsbahia.com.ar/').replace(/\/?$/, '/');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent ?? 'OpenBahiaTransit/0.1';
    this.session =
      options.session ??
      new GpsBahiaSessionManager({
        baseUrl: this.baseUrl,
        fetchImpl: this.fetchImpl,
        userAgent: this.userAgent,
      });
  }

  async ensureRoutes(): Promise<void> {
    if (this.routesReady) {
      return;
    }
    if (!this.routesLoad) {
      this.routesLoad = this.loadRoutesInternal();
    }
    await this.routesLoad;
  }

  async ensureStops(): Promise<void> {
    await this.ensureRoutes();
    if (this.stopsReady) {
      return;
    }
    if (!this.stopsLoad) {
      this.stopsLoad = this.loadStopsInternal();
    }
    await this.stopsLoad;
  }

  /** @deprecated Prefer ensureRoutes/ensureStops; kept for compatibility */
  async load(): Promise<void> {
    await this.ensureRoutes();
    await this.ensureStops();
  }

  async getLines(): Promise<TransitLine[]> {
    await this.ensureRoutes();
    return this.lines;
  }

  async getRoutes(options?: { lineId?: string }): Promise<TransitRoute[]> {
    await this.ensureRoutes();
    return options?.lineId
      ? this.routes.filter((route) => route.lineId === options.lineId)
      : this.routes;
  }

  async getStops(options?: { lineId?: string; routeId?: string }): Promise<TransitStop[]> {
    await this.ensureStops();
    const routeIds = new Set(
      (options?.lineId ? this.routes.filter((route) => route.lineId === options.lineId) : this.routes)
        .filter((route) => (options?.routeId ? route.id === options.routeId : true))
        .map((route) => route.id),
    );
    if (options?.routeId) {
      return this.stops.filter((stop) => stop.routeIds.includes(options.routeId!));
    }
    if (options?.lineId) {
      return this.stops.filter((stop) => stop.routeIds.some((id) => routeIds.has(id)));
    }
    return this.stops;
  }

  private async loadRoutesInternal(): Promise<void> {
    const homepage = await this.session.fetchHomepage();
    this.routes = parseGpsBahiaRoutes(homepage.html);
    this.lines = parseGpsBahiaLinesFromHtml(homepage.html).map((line) => ({
      ...line,
      hasRoutes: this.routes.some((route) => route.lineId === line.id),
      hasRealtime: true,
    }));
    this.routesReady = true;
  }

  private async loadStopsInternal(): Promise<void> {
    try {
      const paradas = await this.fetchParadas();
      this.stops = parseGpsBahiaStops(paradas, this.routes);
    } catch {
      this.stops = [];
    }
    this.stopsReady = true;
  }

  private async fetchParadas(): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}web2/get_paradas`, {
      method: 'POST',
      headers: {
        'user-agent': this.userAgent,
        accept: 'application/json, text/javascript, */*; q=0.01',
        'x-requested-with': 'XMLHttpRequest',
        referer: this.baseUrl,
        origin: this.baseUrl.replace(/\/$/, ''),
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error('public endpoint unavailable');
    }
    return response.json();
  }
}
