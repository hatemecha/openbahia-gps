import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isPlausibleLineId, reasonPhrase, routesToGeoJson } from '@openbahia/transit-core';
import { clientKey, MemoryRateLimit } from './lib/rate-limit.js';
import { isAllowedCorsOrigin } from './lib/cors-origin.js';

function queryString(request: FastifyRequest, key: string): string | undefined {
  const value = (request.query as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requestedLineId(request: FastifyRequest): string | undefined {
  return queryString(request, 'lineId') ?? queryString(request, 'routeId');
}

function validateLineId(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): { ok: true; lineId: string | undefined } | { ok: false } {
  const raw = requestedLineId(request);
  if (!raw) {
    return { ok: true, lineId: undefined };
  }
  if (!isPlausibleLineId(raw)) {
    void reply.code(400).send({ error: reasonPhrase('invalid_line') });
    return { ok: false };
  }
  const known = app.hub.knownLineIds();
  if (known.size > 0 && !known.has(raw)) {
    void reply.code(404).send({ error: reasonPhrase('invalid_line') });
    return { ok: false };
  }
  return { ok: true, lineId: raw };
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const limiter = new MemoryRateLimit(60_000, 120, 8);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'camera=(), microphone=()');
    reply.header('X-Request-Id', request.id);
    if (request.url.startsWith('/api/vehicles') || request.url.startsWith('/api/realtime/')) {
      if (!limiter.allow(clientKey(request))) {
        return reply.code(429).send({ error: 'Demasiados pedidos. Probá de nuevo en un minuto.' });
      }
    }
    return undefined;
  });

  app.get('/api/health', async () => {
    const snapshot = app.hub.snapshot();
    const staticMeta = app.staticStore.getMetadata();
    return {
      status: 'ok',
      provider: app.transitProvider.id,
      available: snapshot.meta.available,
      generatedAt: snapshot.meta.generatedAt,
      realtime: {
        provider: app.transitProvider.id,
        status: snapshot.meta.connectionState,
        available: snapshot.meta.available,
        state: snapshot.meta.realtimeState,
      },
      static: {
        provider: staticMeta?.source ?? 'none',
        state: app.staticStore.getStaticDataState(),
        routes: app.staticStore.getRoutes().length,
        stops: app.staticStore.getStops().length,
        fetchedAt: staticMeta?.fetchedAt ?? null,
        version: staticMeta?.version ?? null,
      },
    };
  });

  app.get('/api/ready', async (_request, reply) => {
    const staticState = app.staticStore.getStaticDataState();
    const ready = staticState !== 'unavailable';
    return reply.code(ready ? 200 : 503).send({
      ready,
      static: staticState,
      realtime: app.hub.snapshot().meta.realtimeState,
    });
  });

  app.get('/api/providers', async () => {
    const snapshot = app.hub.snapshot();
    return {
      data: [
        {
          id: 'gpsbahia',
          active: app.transitProvider.id === 'gpsbahia',
          available: app.transitProvider.id === 'gpsbahia' ? snapshot.meta.available : null,
        },
        {
          id: 'gpsbus',
          active: app.transitProvider.id === 'gpsbus',
          available: app.transitProvider.id === 'gpsbus' ? snapshot.meta.available : null,
        },
        {
          id: 'mock',
          active: app.transitProvider.id === 'mock',
          available: app.transitProvider.id === 'mock' ? true : null,
        },
      ],
      meta: {
        active: app.transitProvider.id,
        generatedAt: snapshot.meta.generatedAt,
      },
    };
  });

  app.get('/api/lines', async () => {
    const lines = app.hub.getLines();
    const catalog = lines.length > 0 ? lines : app.staticStore.getLines();
    return {
      data: catalog,
      meta: {
        provider: app.transitProvider.id,
        count: catalog.length,
        generatedAt: new Date().toISOString(),
        staticProvider: app.staticStore.getMetadata()?.source ?? 'none',
      },
    };
  });

  app.get('/api/routes', async (request, reply) => {
    const parsed = validateLineId(app, request, reply);
    if (!parsed.ok) {
      return;
    }
    const lineId = parsed.lineId;
    const format = queryString(request, 'format');
    const routes = app.staticStore.getRoutes(lineId);
    if (format === 'geojson') {
      return routesToGeoJson(routes);
    }
    return {
      data: routes,
      meta: {
        source: app.staticStore.getMetadata()?.source ?? 'none',
        count: routes.length,
        generatedAt: new Date().toISOString(),
        lineId,
      },
    };
  });

  app.get('/api/routes/:routeId', async (request, reply) => {
    const { routeId } = request.params as { routeId: string };
    if (!isPlausibleLineId(routeId) && !/^[0-9A-Za-z._-]{1,64}$/.test(routeId)) {
      return reply.code(400).send({ error: reasonPhrase('invalid_line') });
    }
    const route = app.staticStore.getRouteById(routeId);
    if (!route) {
      return reply.code(404).send({ error: 'not found' });
    }
    return { data: route };
  });

  app.get('/api/stops', async (request, reply) => {
    const parsed = validateLineId(app, request, reply);
    if (!parsed.ok) {
      return;
    }
    const lineId = parsed.lineId;
    const routeId = queryString(request, 'matchedRouteId');
    const stops = app.staticStore.getStops({ lineId, routeId });
    return {
      data: stops,
      meta: {
        source: app.staticStore.getMetadata()?.source ?? 'none',
        count: stops.length,
        generatedAt: new Date().toISOString(),
        lineId,
      },
    };
  });

  app.get('/api/vehicles', async (request, reply) => {
    const parsed = validateLineId(app, request, reply);
    if (!parsed.ok) {
      return;
    }
    const lineId = parsed.lineId;
    await app.hub.setRouteId(lineId ?? app.hub.getRouteId());
    return app.hub.snapshot(lineId ?? app.hub.getRouteId());
  });

  app.get('/api/realtime/vehicles', async (request, reply) => {
    const parsed = validateLineId(app, request, reply);
    if (!parsed.ok) {
      return;
    }
    const key = clientKey(request);
    if (!limiter.acquireSse(key)) {
      return reply.code(429).send({ error: 'Demasiadas conexiones en vivo. Cerrá otra pestaña e intentá de nuevo.' });
    }
    const lineId = parsed.lineId ?? app.hub.getRouteId() ?? '503';
    await app.hub.ensureLine(lineId);
    return openSse(app, request, reply, lineId, () => limiter.releaseSse(key));
  });

  if (app.appConfig.debugEndpoints) {
    app.get('/api/debug/status', async () => ({
      realtime: app.hub.getMetrics(),
      static: app.staticStore.getMetadata(),
      provider: app.transitProvider.id,
    }));
  }
}

async function openSse(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  lineId: string,
  onClose: () => void,
): Promise<void> {
  reply.hijack();
  const origin = request.headers.origin;
  const corsHeaders =
    origin && isAllowedCorsOrigin(origin, app.appConfig)
      ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
      : {};
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Content-Type-Options': 'nosniff',
    ...corsHeaders,
  });
  reply.raw.write(': connected\n\n');

  let closed = false;
  const write = (payload: unknown) => {
    if (closed || reply.raw.writableEnded || reply.raw.destroyed) {
      return;
    }
    try {
      reply.raw.write(`event: vehicles\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      closed = true;
    }
  };

  const unsubscribe = app.hub.subscribe((payload) => {
    write(payload);
  }, lineId);

  const heartbeat = setInterval(() => {
    if (closed || reply.raw.writableEnded || reply.raw.destroyed) {
      return;
    }
    try {
      reply.raw.write(`event: ping\ndata: ${Date.now()}\n\n`);
    } catch {
      closed = true;
    }
  }, 15_000);
  heartbeat.unref?.();

  let released = false;
  const release = () => {
    if (released) {
      return;
    }
    released = true;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
    onClose();
  };

  request.raw.on('close', release);
  request.raw.on('error', release);
}
