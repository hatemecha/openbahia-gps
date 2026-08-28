import {
  CircuitBreaker,
  classifyGpsObservation,
  connectionStateFromRealtime,
  COPY,
  deriveRealtimeState,
  enrichMatchedVehicle,
  freshnessLevel,
  gpsRejectLogMessage,
  haversineMeters,
  isStale,
  isVehiclePubliclyVisible,
  matchVehicleToRoutes,
  parseVehiclePositions,
  reasonPhrase,
  vehicleVisibleMaxAgeMs,
  vehiclesResponseSchema,
  type ConnectionState,
  type FreshnessConfig,
  type PositionKind,
  type RealtimeProvider,
  type RealtimeState,
  type RouteMatch,
  type StaticDataState,
  type TransitLine,
  type VehiclePosition,
} from '@openbahia/transit-core';
import type { FastifyBaseLogger } from 'fastify';
import type { StaticStore } from './static-store.js';
import { UpstreamScheduler } from './upstream-scheduler.js';

export interface VehiclesEnvelope {
  data: VehiclePosition[];
  meta: {
    provider: string;
    count: number;
    generatedAt: string;
    stale: boolean;
    freshness: 'live' | 'stale' | 'very_stale';
    connectionState: ConnectionState;
    available: boolean;
    lastSuccessfulUpdate: string | null;
    reason?: string;
    lineId?: string;
    realtimeState?: RealtimeState;
    staticDataState?: StaticDataState;
  };
}

export interface RealtimeMetrics {
  upstreamRequests: number;
  upstreamSuccess: number;
  upstreamFail: number;
  sessionRefreshes: number;
  cacheHits: number;
  activeLines: number;
  sseClients: number;
  circuitState: string;
}

interface HubOptions {
  provider: RealtimeProvider;
  refreshMs: number;
  idleTtlMs: number;
  maxActiveLines: number;
  freshness: FreshnessConfig;
  logger: FastifyBaseLogger;
  staticStore?: StaticStore;
  sessionRefreshCount?: () => number;
  circuitBreaker?: CircuitBreaker;
  maxConcurrentRequests?: number;
}

type Listener = (payload: VehiclesEnvelope) => void;

interface Observation {
  at: number;
  latitude: number;
  longitude: number;
  bearing?: number;
  match?: RouteMatch | null;
}

interface LineSlot {
  lineId: string;
  vehicles: VehiclePosition[];
  available: boolean;
  reason?: string;
  lastRequestedAt: number;
  lastSuccessfulUpdate: string | null;
  nextRefreshAt: number;
  consecutiveErrors: number;
  subscribers: number;
  refreshInFlight: Promise<void> | null;
  timer: ReturnType<typeof setTimeout> | null;
  refreshFailed: boolean;
}

function backoffMs(refreshMs: number, consecutiveErrors: number): number {
  const steps = [refreshMs, refreshMs * 2, refreshMs * 4, 60_000];
  const base = steps[Math.min(consecutiveErrors, steps.length - 1)] ?? 60_000;
  const jitter = Math.floor(Math.random() * 0.25 * base);
  return base + jitter;
}

export class VehicleHub {
  private readonly slots = new Map<string, LineSlot>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly history = new Map<string, Observation[]>();
  private readonly lastMatch = new Map<string, RouteMatch>();
  private readonly lastPositionKind = new Map<string, PositionKind>();
  private readonly lastGood = new Map<string, { point: { latitude: number; longitude: number }; at: number }>();
  private readonly breaker: CircuitBreaker;
  private readonly scheduler: UpstreamScheduler;
  private lines: TransitLine[] = [];
  private focusedLineId = '503';
  private started = false;
  private readonly metrics: Omit<RealtimeMetrics, 'circuitState'> & { circuitState?: string } = {
    upstreamRequests: 0,
    upstreamSuccess: 0,
    upstreamFail: 0,
    sessionRefreshes: 0,
    cacheHits: 0,
    activeLines: 0,
    sseClients: 0,
  };

  constructor(private readonly options: HubOptions) {
    this.breaker = options.circuitBreaker ?? new CircuitBreaker({ failureThreshold: 4, cooldownMs: 30_000 });
    this.scheduler = new UpstreamScheduler(options.maxConcurrentRequests ?? 2);
  }

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.started = false;
    for (const slot of this.slots.values()) {
      if (slot.timer) {
        clearTimeout(slot.timer);
        slot.timer = null;
      }
    }
    this.listeners.clear();
    this.metrics.sseClients = 0;
  }

  subscribe(listener: Listener, lineId = this.focusedLineId): () => void {
    const id = lineId;
    const bucket = this.listeners.get(id) ?? new Set<Listener>();
    bucket.add(listener);
    this.listeners.set(id, bucket);
    const slot = this.slot(id);
    slot.subscribers += 1;
    this.metrics.sseClients += 1;
    slot.lastRequestedAt = Date.now();
    this.activate(id);
    listener(this.snapshot(id));
    return () => {
      bucket.delete(listener);
      slot.subscribers = Math.max(0, slot.subscribers - 1);
      this.metrics.sseClients = Math.max(0, this.metrics.sseClients - 1);
    };
  }

  async setRouteId(routeId: string | undefined): Promise<void> {
    const lineId = routeId ?? this.focusedLineId;
    this.focusedLineId = lineId;
    await this.ensureLine(lineId);
  }

  getRouteId(): string | undefined {
    return this.focusedLineId;
  }

  knownLineIds(): Set<string> {
    const ids = new Set(this.lines.map((line) => line.id));
    for (const extra of this.options.staticStore?.getLines() ?? []) {
      ids.add(extra.id);
    }
    return ids;
  }

  snapshot(lineId = this.focusedLineId): VehiclesEnvelope {
    const slot = this.slots.get(lineId);
    const vehicles = this.publicVehicles(slot?.vehicles ?? []);
    const generatedAt = new Date().toISOString();
    const newestVehicle = vehicles.reduce<string | null>((latest, vehicle) => {
      if (!latest || vehicle.observedAt > latest) {
        return vehicle.observedAt;
      }
      return latest;
    }, null);
    const lastSuccessfulUpdate = slot?.lastSuccessfulUpdate ?? null;
    const freshness = newestVehicle
      ? freshnessLevel(Date.now() - Date.parse(newestVehicle), this.options.freshness)
      : freshnessLevel(
          lastSuccessfulUpdate ? Date.now() - Date.parse(lastSuccessfulUpdate) : Number.POSITIVE_INFINITY,
          this.options.freshness,
        );
    const available = slot?.available ?? false;
    const refreshFailed = slot?.refreshFailed ?? false;
    const realtimeState = deriveRealtimeState({
      providerId: this.options.provider.id,
      available,
      vehicleCount: vehicles.length,
      freshness,
      lastSuccessfulUpdate,
      refreshFailed,
      started: this.started || Boolean(lastSuccessfulUpdate),
    });
    const reason = publicReason({
      realtimeState,
      available,
      vehicleCount: vehicles.length,
      fallback: slot?.reason,
    });
    const payload = {
      data: vehicles,
      meta: {
        provider: this.options.provider.id,
        count: vehicles.length,
        generatedAt,
        stale: isStale(freshness) || !available || refreshFailed,
        freshness,
        connectionState: connectionStateFromRealtime(realtimeState),
        available,
        lastSuccessfulUpdate,
        reason,
        lineId,
        realtimeState,
        staticDataState: this.options.staticStore?.getStaticDataState() ?? 'unavailable',
      },
    };
    const parsed = vehiclesResponseSchema.safeParse(payload);
    if (!parsed.success) {
      this.options.logger.error({ issues: parsed.error.issues, lineId }, 'invalid vehicles snapshot');
      return {
        data: [],
        meta: {
          provider: this.options.provider.id,
          count: 0,
          generatedAt,
          stale: true,
          freshness: 'very_stale',
          connectionState: 'unavailable',
          available: false,
          lastSuccessfulUpdate,
          reason: reasonPhrase('upstream_unavailable'),
          lineId,
          realtimeState: 'upstream_unavailable',
          staticDataState: this.options.staticStore?.getStaticDataState() ?? 'unavailable',
        },
      };
    }
    return parsed.data;
  }

  getLines(): TransitLine[] {
    return this.lines;
  }

  getMetrics(): RealtimeMetrics {
    this.metrics.activeLines = [...this.slots.values()].filter((slot) => slot.timer !== null).length;
    this.metrics.sessionRefreshes = this.options.sessionRefreshCount?.() ?? this.metrics.sessionRefreshes;
    return { ...this.metrics, circuitState: this.breaker.getState() };
  }

  async primeCatalog(): Promise<void> {
    this.lines = await this.resolveLines();
  }

  async refresh(): Promise<void> {
    await this.refreshLine(this.focusedLineId);
  }

  async ensureLine(lineId: string): Promise<void> {
    const slot = this.slot(lineId);
    slot.lastRequestedAt = Date.now();
    this.focusedLineId = lineId;
    this.activate(lineId);
    if (slot.refreshInFlight) {
      await slot.refreshInFlight;
      return;
    }
    const cacheAgeMs = slot.lastSuccessfulUpdate
      ? Date.now() - Date.parse(slot.lastSuccessfulUpdate)
      : Number.POSITIVE_INFINITY;
    if (!slot.lastSuccessfulUpdate || cacheAgeMs > this.options.refreshMs) {
      await this.refreshLine(lineId);
      return;
    }
    this.metrics.cacheHits += 1;
  }

  private activate(lineId: string): void {
    this.evictIfNeeded(lineId);
    const slot = this.slot(lineId);
    if (!this.started) {
      return;
    }
    if (slot.timer) {
      return;
    }
    this.schedule(lineId, 0);
  }

  private schedule(lineId: string, delayMs: number): void {
    const slot = this.slot(lineId);
    if (slot.timer) {
      clearTimeout(slot.timer);
    }
    slot.timer = setTimeout(() => {
      void this.tick(lineId);
    }, delayMs);
    slot.timer.unref?.();
  }

  private async tick(lineId: string): Promise<void> {
    const slot = this.slots.get(lineId);
    if (!slot || !this.started) {
      return;
    }
    const idle = slot.subscribers === 0 && Date.now() - slot.lastRequestedAt > this.options.idleTtlMs;
    if (idle) {
      if (slot.timer) {
        clearTimeout(slot.timer);
        slot.timer = null;
      }
      return;
    }
    await this.refreshLine(lineId);
    const wait = Math.max(0, slot.nextRefreshAt - Date.now());
    this.schedule(lineId, wait);
  }

  private async refreshLine(lineId: string): Promise<void> {
    const slot = this.slot(lineId);
    if (slot.refreshInFlight) {
      this.metrics.cacheHits += 1;
      return slot.refreshInFlight;
    }
    slot.refreshInFlight = this.refreshInternal(lineId);
    try {
      await slot.refreshInFlight;
    } finally {
      slot.refreshInFlight = null;
    }
  }

  private async refreshInternal(lineId: string): Promise<void> {
    const started = Date.now();
    const provider = this.options.provider;
    const slot = this.slot(lineId);
    if (!this.breaker.canRequest()) {
      this.options.logger.warn(
        { provider: provider.id, lineId, circuit: this.breaker.getState() },
        'circuit open; serving cache',
      );
      slot.refreshFailed = true;
      slot.available = slot.lastSuccessfulUpdate !== null;
      slot.reason = reasonPhrase('upstream_unavailable');
      slot.nextRefreshAt = Date.now() + backoffMs(this.options.refreshMs, Math.max(slot.consecutiveErrors, 1));
      this.emit(lineId);
      return;
    }
    this.metrics.upstreamRequests += 1;
    try {
      await this.scheduler.enqueue(async () => {
        this.lines = await this.resolveLines();
        const vehicles = await provider.getVehicles({ routeId: lineId, lineId });
        const parsed = parseVehiclePositions(vehicles);
        const enriched = parsed.success ? this.enrich(lineId, parsed.data) : [];
        if (!parsed.success) {
          this.options.logger.warn({ lineId }, 'upstream vehicles failed schema validation');
        }
        slot.vehicles = enriched;
        slot.available = true;
        slot.refreshFailed = false;
        slot.reason = undefined;
        slot.lastSuccessfulUpdate = new Date().toISOString();
        slot.consecutiveErrors = 0;
        slot.nextRefreshAt = Date.now() + this.options.refreshMs;
        this.breaker.success();
        this.metrics.upstreamSuccess += 1;
        this.options.logger.debug(
          {
            provider: provider.id,
            count: slot.vehicles.length,
            lineId,
            latencyMs: Date.now() - started,
          },
          'refresh successful',
        );
        this.emit(lineId);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'external error';
      slot.consecutiveErrors += 1;
      slot.nextRefreshAt = Date.now() + backoffMs(this.options.refreshMs, slot.consecutiveErrors);
      slot.refreshFailed = true;
      slot.available = slot.lastSuccessfulUpdate !== null;
      slot.reason = reasonPhrase('upstream_unavailable');
      this.breaker.failure();
      this.metrics.upstreamFail += 1;
      this.options.logger.error(
        { provider: provider.id, err: message, lineId, latencyMs: Date.now() - started },
        'external error',
      );
      this.emit(lineId);
    }
  }

  private enrich(lineId: string, vehicles: VehiclePosition[]): VehiclePosition[] {
    const routes = this.options.staticStore?.getRoutes(lineId) ?? [];
    const stops = this.options.staticStore?.getStops({ lineId }) ?? [];
    const out: VehiclePosition[] = [];
    for (const vehicle of vehicles) {
      const key = `${lineId}:${vehicle.vehicleId}`;
      const previousGood = this.lastGood.get(key);
      const reject = classifyGpsObservation({
        point: { latitude: vehicle.latitude, longitude: vehicle.longitude },
        observedAt: vehicle.observedAt,
        receivedAt: vehicle.receivedAt,
        previous: previousGood,
      });
      if (reject !== 'ok') {
        this.options.logger.warn(
          { vehicleId: vehicle.vehicleId, lineId, reason: reject },
          gpsRejectLogMessage(reject, vehicle.vehicleId),
        );
        continue;
      }
      const trail = this.history.get(key) ?? [];
      const speedMps = estimateSpeed(trail, vehicle);
      const previous = this.lastMatch.get(key);
      const match =
        routes.length === 0 ? null : matchVehicleToRoutes(vehicle, routes, { previous, speedMps });
      if (match) {
        this.lastMatch.set(key, match);
      }
      const next = {
        at: Date.parse(vehicle.observedAt),
        latitude: vehicle.latitude,
        longitude: vehicle.longitude,
        bearing: vehicle.bearing,
        match,
      };
      this.history.set(key, [...trail, next].slice(-40));
      this.lastGood.set(key, {
        point: { latitude: vehicle.latitude, longitude: vehicle.longitude },
        at: next.at,
      });
      const enriched = enrichMatchedVehicle({
        vehicle: { ...vehicle, lineId, routeId: vehicle.routeId ?? lineId },
        match,
        routes,
        stops,
        previousPositionKind: this.lastPositionKind.get(key),
      });
      if (enriched.distanceFromRouteMeters !== undefined) {
        enriched.distanceFromRouteMeters = Math.round(enriched.distanceFromRouteMeters * 10) / 10;
      }
      if (enriched.positionKind) {
        this.lastPositionKind.set(key, enriched.positionKind);
      }
      out.push(enriched);
    }
    return out;
  }

  private publicVehicles(vehicles: VehiclePosition[]): VehiclePosition[] {
    const now = Date.now();
    const maxAgeMs = vehicleVisibleMaxAgeMs(this.options.freshness);
    return vehicles.filter((vehicle) => {
      if (!isVehiclePubliclyVisible(vehicle, now, maxAgeMs)) {
        return false;
      }
      return true;
    });
  }

  private async resolveLines(): Promise<TransitLine[]> {
    const fromProvider = await this.options.provider.getLines();
    const staticLines = this.options.staticStore?.getLines() ?? [];
    const staticById = new Map(staticLines.map((line) => [line.id, line]));
    const merged: TransitLine[] = fromProvider.map((line) => {
      const extra = staticById.get(line.id);
      return {
        ...line,
        hasRealtime: true,
        hasRoutes: (this.options.staticStore?.getRoutes(line.id).length ?? 0) > 0,
        name: extra?.name ?? line.name,
      };
    });
    for (const extra of staticLines) {
      if (!merged.some((line) => line.id === extra.id)) {
        merged.push({ ...extra, hasRealtime: false, hasRoutes: extra.hasRoutes ?? true });
      }
    }
    return merged;
  }

  private emit(lineId: string): void {
    const payload = this.snapshot(lineId);
    const bucket = this.listeners.get(lineId);
    if (!bucket) {
      return;
    }
    for (const listener of bucket) {
      listener(payload);
    }
  }

  private slot(lineId: string): LineSlot {
    const current = this.slots.get(lineId);
    if (current) {
      return current;
    }
    const created: LineSlot = {
      lineId,
      vehicles: [],
      available: false,
      reason: COPY.starting,
      lastRequestedAt: 0,
      lastSuccessfulUpdate: null,
      nextRefreshAt: 0,
      consecutiveErrors: 0,
      subscribers: 0,
      refreshInFlight: null,
      timer: null,
      refreshFailed: false,
    };
    this.slots.set(lineId, created);
    return created;
  }

  private evictIfNeeded(lineId: string): void {
    if (this.slots.has(lineId)) {
      return;
    }
    const active = [...this.slots.values()].filter((slot) => slot.timer !== null || slot.subscribers > 0);
    if (active.length < this.options.maxActiveLines) {
      return;
    }
    const evictable = active
      .filter((slot) => slot.subscribers === 0)
      .sort((a, b) => a.lastRequestedAt - b.lastRequestedAt);
    const victim = evictable[0];
    if (!victim) {
      return;
    }
    if (victim.timer) {
      clearTimeout(victim.timer);
      victim.timer = null;
    }
    this.slots.delete(victim.lineId);
  }

  getSchedulerStats(): { active: number; queued: number } {
    return {
      active: this.scheduler.getActiveCount(),
      queued: this.scheduler.getQueueLength(),
    };
  }
}

function estimateSpeed(history: Observation[], vehicle: VehiclePosition): number | undefined {
  const previous = history.at(-1);
  if (!previous) {
    return vehicle.speed;
  }
  const dt = (Date.parse(vehicle.observedAt) - previous.at) / 1000;
  if (!(dt > 0.5)) {
    return vehicle.speed ?? 0;
  }
  return haversineMeters(previous, vehicle) / dt;
}

function publicReason(args: {
  realtimeState: RealtimeState;
  available: boolean;
  vehicleCount: number;
  fallback?: string;
}): string | undefined {
  switch (args.realtimeState) {
    case 'live':
    case 'demo':
      return undefined;
    case 'delayed':
      return args.fallback;
    case 'very_stale':
      return reasonPhrase('very_stale');
    case 'no_vehicles':
      return reasonPhrase('no_vehicles');
    case 'offline':
      return reasonPhrase('offline');
    case 'upstream_unavailable':
      return reasonPhrase('upstream_unavailable');
    case 'initial_loading':
      return COPY.starting;
    default: {
      const exhaustive: never = args.realtimeState;
      return exhaustive;
    }
  }
}
