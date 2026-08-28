import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  STATIC_SCHEMA_VERSION,
  parseTransitLines,
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
  bootstrapPath?: string;
  now?: () => number;
  logger?: { warn: (obj: unknown, msg?: string) => void; info: (obj: unknown, msg?: string) => void };
}

const SNAPSHOT_FILE = 'static-snapshot.json';

/** Sources that already carry provider-grade geometry; refresh in-place only. */
const PRIMARY_STATIC_SOURCES = new Set(['gpsbahia', 'gpsbus']);

function isPrimaryStaticSource(source: string | undefined): boolean {
  return source !== undefined && PRIMARY_STATIC_SOURCES.has(source);
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

function validateSnapshot(raw: unknown): CachedStaticDataset | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const metadata = record.metadata as StaticDatasetMetadata | undefined;
  const routes = parseTransitRoutes(record.routes);
  const stops = parseTransitStops(record.stops);
  const lines = parseTransitLines(record.lines);
  if (!metadata?.source || !routes.success) {
    return null;
  }
  const schemaVersion = metadata.schemaVersion ?? 1;
  if (schemaVersion !== STATIC_SCHEMA_VERSION) {
    return null;
  }
  const stopData = stops.success ? stops.data : [];
  if (checksumFor(routes.data, stopData) !== metadata.checksum) {
    return null;
  }
  if (routes.data.length === 0) {
    return null;
  }
  return {
    metadata: { ...metadata, schemaVersion },
    routes: routes.data,
    stops: stopData,
    lines: lines.success && lines.data.length > 0 ? lines.data : linesFromRoutes(routes.data),
  };
}

export class StaticStore {
  private dataset: CachedStaticDataset | null = null;
  private readonly now: () => number;
  private shuttingDown = false;
  private refreshInFlight: Promise<CachedStaticDataset> | null = null;

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

  /** Fast path: load snapshot/bootstrap from disk only. */
  async loadFromCache(): Promise<boolean> {
    const cached = await this.readCache();
    if (cached) {
      this.dataset = cached;
      return true;
    }
    const bootstrap = await this.readBootstrap();
    if (bootstrap) {
      this.dataset = bootstrap;
      return true;
    }
    return false;
  }

  /** Full load: cache first, then refresh upstream or fallback chain. */
  async load(): Promise<CachedStaticDataset> {
    if (!this.dataset) {
      await this.loadFromCache();
    }
    return this.refresh();
  }

  /** Background refresh; keeps current dataset on failure. */
  refresh(): Promise<CachedStaticDataset> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    this.refreshInFlight = this.refreshInternal().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  beginShutdown(): void {
    this.shuttingDown = true;
  }

  private async refreshInternal(): Promise<CachedStaticDataset> {
    const diskCache = await this.readCache();
    const cached = diskCache ?? this.dataset;

    if (cached && isPrimaryStaticSource(cached.metadata.source)) {
      this.dataset = cached;
      const sameSource = this.options.providers.find(
        (provider) => provider.id === cached.metadata.source,
      );
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

    if (diskCache) {
      this.dataset = diskCache;
      return diskCache;
    }

    const bootstrap = this.dataset ?? (await this.readBootstrap());
    if (bootstrap) {
      this.dataset = bootstrap;
      return bootstrap;
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

  private async tryProvider(provider: StaticTransitProvider): Promise<CachedStaticDataset | null> {
    try {
      const routesRaw = await provider.getRoutes();
      const parsedRoutes = parseTransitRoutes(routesRaw);
      if (!parsedRoutes.success || parsedRoutes.data.length === 0) {
        this.options.logger?.warn({ source: provider.id }, 'static provider returned no usable routes');
        return null;
      }
      let stops: TransitStop[] = [];
      try {
        const stopsRaw = await provider.getStops();
        const parsedStops = parseTransitStops(stopsRaw);
        stops = parsedStops.success ? parsedStops.data : [];
      } catch (error) {
        this.options.logger?.warn(
          { source: provider.id, err: error instanceof Error ? error.message : 'error' },
          'static provider stops unavailable; keeping routes only',
        );
      }
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
    const snapshot = await this.readSnapshotFile(join(this.options.cacheDir, SNAPSHOT_FILE));
    if (snapshot) {
      return snapshot;
    }
    return this.readLegacyCache();
  }

  private async readSnapshotFile(path: string): Promise<CachedStaticDataset | null> {
    try {
      const raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
      return validateSnapshot(raw);
    } catch {
      return null;
    }
  }

  private async readLegacyCache(): Promise<CachedStaticDataset | null> {
    try {
      const [routesRaw, stopsRaw, metadataRaw] = await Promise.all([
        readFile(join(this.options.cacheDir, 'routes.json'), 'utf8'),
        readFile(join(this.options.cacheDir, 'stops.json'), 'utf8'),
        readFile(join(this.options.cacheDir, 'metadata.json'), 'utf8'),
      ]);
      const routes = parseTransitRoutes(JSON.parse(routesRaw) as unknown);
      const stops = parseTransitStops(JSON.parse(stopsRaw) as unknown);
      const metadata = JSON.parse(metadataRaw) as StaticDatasetMetadata;
      if (!routes.success || !metadata.source || routes.data.length === 0) {
        return null;
      }
      const stopData = stops.success ? stops.data : [];
      if (metadata.checksum && checksumFor(routes.data, stopData) !== metadata.checksum) {
        return null;
      }
      return {
        metadata: { ...metadata, schemaVersion: STATIC_SCHEMA_VERSION },
        routes: routes.data,
        stops: stopData,
        lines: linesFromRoutes(routes.data),
      };
    } catch {
      return null;
    }
  }

  private async readBootstrap(): Promise<CachedStaticDataset | null> {
    const path =
      this.options.bootstrapPath ??
      join(process.cwd(), 'data', 'bootstrap', 'bahia-routes.json');
    try {
      const raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
      const snapshot = validateSnapshot(raw);
      if (snapshot) {
        return snapshot;
      }
    } catch {
      // bootstrap optional
    }
    return null;
  }

  private async writeCache(dataset: CachedStaticDataset): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    try {
      await mkdir(this.options.cacheDir, { recursive: true });
      await writeAtomic(
        join(this.options.cacheDir, SNAPSHOT_FILE),
        `${JSON.stringify(dataset)}\n`,
      );
      await this.cleanupOrphanTemps(this.options.cacheDir);
    } catch (error) {
      this.options.logger?.warn(
        { err: error instanceof Error ? error.message : 'error' },
        'static cache write failed; in-memory dataset kept',
      );
    }
  }

  private async cleanupOrphanTemps(dir: string): Promise<void> {
    try {
      const names = await readdir(dir);
      for (const name of names) {
        if (name.includes('.tmp') && name.startsWith(SNAPSHOT_FILE)) {
          await unlink(join(dir, name)).catch(() => undefined);
        }
      }
    } catch {
      // ignore
    }
  }
}
