import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  STATIC_SCHEMA_VERSION,
  parseTransitRoutes,
  parseTransitStops,
  type StaticDatasetMetadata,
  type StaticDataState,
  type StaticTransitProvider,
  type TransitLine,
  type TransitRoute,
  type TransitStop,
} from '@openbahia/transit-core';

export interface CachedStaticDataset {
  metadata: StaticDatasetMetadata;
  lines: TransitLine[];
  routes: TransitRoute[];
  stops: TransitStop[];
}

export interface StaticStoreOptions {
  cacheDir: string;
  providers: StaticTransitProvider[];
  now?: () => number;
  logger?: { warn: (obj: unknown, msg?: string) => void; info: (obj: unknown, msg?: string) => void };
}

function checksumFor(routes: TransitRoute[], stops: TransitStop[]): string {
  return createHash('sha256')
    .update(JSON.stringify({ routes, stops }))
    .digest('hex');
}

function linesFromRoutes(routes: TransitRoute[], extra: TransitLine[] = []): TransitLine[] {
  const byId = new Map(extra.map((line) => [line.id, line]));
  for (const route of routes) {
    if (!byId.has(route.lineId)) {
      byId.set(route.lineId, { id: route.lineId, name: route.name ?? route.lineId, hasRoutes: true });
    }
  }
  return [...byId.values()];
}

async function writeAtomic(path: string, contents: string): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(tmp, 'w');
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, path);
}

export class StaticStore {
  private dataset: CachedStaticDataset | null = null;
  private readonly now: () => number;
  private shuttingDown = false;

  constructor(private readonly options: StaticStoreOptions) {
    this.now = options.now ?? Date.now;
  }

  getMetadata(): StaticDatasetMetadata | null {
    return this.dataset?.metadata ?? null;
  }

  getStaticDataState(): StaticDataState {
    if (!this.dataset || this.dataset.routes.length === 0) {
      return 'unavailable';
    }
    if (this.dataset.stops.length === 0) {
      return 'partial';
    }
    const age = this.now() - Date.parse(this.dataset.metadata.fetchedAt);
    if (Number.isFinite(age) && age > 36 * 60 * 60_000) {
      return 'cached';
    }
    return 'ready';
  }

  getLines(): TransitLine[] {
    return this.dataset?.lines ?? [];
  }

  getRoutes(lineId?: string): TransitRoute[] {
    const routes = this.dataset?.routes ?? [];
    return lineId ? routes.filter((route) => route.lineId === lineId) : routes;
  }

  getStops(options?: { lineId?: string; routeId?: string }): TransitStop[] {
    const stops = this.dataset?.stops ?? [];
    if (options?.routeId) {
      return stops.filter((stop) => stop.routeIds.includes(options.routeId!));
    }
    if (options?.lineId) {
      const ids = new Set(this.getRoutes(options.lineId).map((route) => route.id));
      return stops.filter((stop) => stop.routeIds.some((id) => ids.has(id)));
    }
    return stops;
  }

  getRouteById(routeId: string): TransitRoute | undefined {
    return this.dataset?.routes.find((route) => route.id === routeId);
  }

  knownLineIds(): Set<string> {
    return new Set(this.getLines().map((line) => line.id));
  }

  async load(): Promise<CachedStaticDataset> {
    const cached = await this.readCache();
    if (cached) {
      this.dataset = cached;
      const sameSource = this.options.providers.find((provider) => provider.id === cached.metadata.source);
      if (sameSource) {
        const refreshed = await this.tryProvider(sameSource);
        if (refreshed) {
          this.dataset = refreshed;
          await this.writeCache(refreshed);
          return refreshed;
        }
      }
      this.options.logger?.info(
        { source: cached.metadata.source },
        'static cache kept; upstream refresh skipped or failed (no source flap)',
      );
      return cached;
    }

    for (const provider of this.options.providers) {
      const dataset = await this.tryProvider(provider);
      if (!dataset) {
        continue;
      }
      this.dataset = dataset;
      await this.writeCache(dataset);
      return dataset;
    }

    const empty: CachedStaticDataset = {
      metadata: {
        source: 'none',
        version: 'empty',
        fetchedAt: new Date(this.now()).toISOString(),
        checksum: checksumFor([], []),
        schemaVersion: STATIC_SCHEMA_VERSION,
      },
      lines: [],
      routes: [],
      stops: [],
    };
    this.dataset = empty;
    return empty;
  }

  beginShutdown(): void {
    this.shuttingDown = true;
  }

  private async tryProvider(provider: StaticTransitProvider): Promise<CachedStaticDataset | null> {
    try {
      const routes = await provider.getRoutes();
      const parsedRoutes = parseTransitRoutes(routes);
      if (!parsedRoutes.success || parsedRoutes.data.length === 0) {
        this.options.logger?.warn({ source: provider.id }, 'static provider returned no usable routes');
        return null;
      }
      const stopsRaw = await provider.getStops();
      const parsedStops = parseTransitStops(stopsRaw);
      const stops = parsedStops.success ? parsedStops.data : [];
      const checksum = checksumFor(parsedRoutes.data, stops);
      const lines = await provider.getLines().catch(() => linesFromRoutes(parsedRoutes.data));
      return {
        metadata: {
          source: provider.id,
          version: checksum.slice(0, 12),
          fetchedAt: new Date(this.now()).toISOString(),
          checksum,
          schemaVersion: STATIC_SCHEMA_VERSION,
        },
        lines: linesFromRoutes(parsedRoutes.data, lines),
        routes: parsedRoutes.data,
        stops,
      };
    } catch (error) {
      this.options.logger?.warn(
        { source: provider.id, err: error instanceof Error ? error.message : 'error' },
        'static provider failed',
      );
      return null;
    }
  }

  private async readCache(): Promise<CachedStaticDataset | null> {
    try {
      const [routesRaw, stopsRaw, metadataRaw] = await Promise.all([
        readFile(join(this.options.cacheDir, 'routes.json'), 'utf8'),
        readFile(join(this.options.cacheDir, 'stops.json'), 'utf8'),
        readFile(join(this.options.cacheDir, 'metadata.json'), 'utf8'),
      ]);
      const routes = parseTransitRoutes(JSON.parse(routesRaw) as unknown);
      const stops = parseTransitStops(JSON.parse(stopsRaw) as unknown);
      const metadata = JSON.parse(metadataRaw) as StaticDatasetMetadata;
      const schemaVersion = metadata.schemaVersion ?? 1;
      if (!routes.success || !stops.success || !metadata.source) {
        this.options.logger?.warn({ reason: 'parse' }, 'static cache rejected');
        return null;
      }
      if (schemaVersion !== STATIC_SCHEMA_VERSION) {
        this.options.logger?.warn({ schemaVersion }, 'static cache schema incompatible');
        return null;
      }
      if (checksumFor(routes.data, stops.data) !== metadata.checksum) {
        this.options.logger?.warn({ reason: 'checksum' }, 'static cache rejected');
        return null;
      }
      if (routes.data.length === 0) {
        return null;
      }
      return {
        metadata: { ...metadata, schemaVersion },
        routes: routes.data,
        stops: stops.data,
        lines: linesFromRoutes(routes.data),
      };
    } catch {
      return null;
    }
  }

  private async writeCache(dataset: CachedStaticDataset): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    try {
      await mkdir(this.options.cacheDir, { recursive: true });
      await writeAtomic(join(this.options.cacheDir, 'routes.json'), `${JSON.stringify(dataset.routes)}\n`);
      await writeAtomic(join(this.options.cacheDir, 'stops.json'), `${JSON.stringify(dataset.stops)}\n`);
      await writeAtomic(
        join(this.options.cacheDir, 'metadata.json'),
        `${JSON.stringify(dataset.metadata, null, 2)}\n`,
      );
    } catch (error) {
      this.options.logger?.warn(
        { err: error instanceof Error ? error.message : 'error' },
        'static cache write failed; in-memory dataset kept',
      );
    }
  }
}
