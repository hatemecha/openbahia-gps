import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { GpsBahiaProvider } from '@openbahia/provider-gpsbahia';
import type { AppConfig } from '@openbahia/shared';
import type { RealtimeProvider } from '@openbahia/transit-core';
import { VehicleHub } from './lib/hub.js';
import { createSessionManager, createStaticProviders } from './lib/providers.js';
import { StaticStore } from './lib/static-store.js';
import { isAllowedCorsOrigin } from './lib/cors-origin.js';
import { registerRoutes } from './routes.js';

export interface BuildAppOptions {
  config: AppConfig;
  provider: RealtimeProvider;
  startPolling?: boolean;
  logger?: boolean | FastifyInstance['log'];
  staticStore?: StaticStore;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    // An empty list means direct connections only. Deployments opt in to the
    // exact proxy addresses they operate behind; never trust arbitrary headers.
    trustProxy: options.config.trustedProxyIps.length > 0 ? options.config.trustedProxyIps : false,
    logger:
      options.logger === false
        ? false
        : {
            level: 'info',
            redact: {
              paths: ['req.headers.cookie', 'req.headers.authorization', 'token', 'vgggaxqq'],
              remove: true,
            },
          },
  });

  const session =
    options.provider instanceof GpsBahiaProvider
      ? options.provider.getSessionManager()
      : createSessionManager(options.config);
  const staticStore =
    options.staticStore ??
    new StaticStore({
      cacheDir: options.config.staticCacheDir,
      providers: createStaticProviders(options.config, options.provider, session),
      logger: app.log,
    });

  const hub = new VehicleHub({
    provider: options.provider,
    refreshMs: options.config.realtimeRefreshMs,
    idleTtlMs: options.config.realtimeIdleTtlMs,
    maxActiveLines: options.config.realtimeMaxActiveLines,
    maxConcurrentRequests: options.config.realtimeMaxConcurrentRequests,
    freshness: options.config.freshness,
    logger: app.log,
    staticStore,
    sessionRefreshCount: () =>
      options.provider instanceof GpsBahiaProvider ? options.provider.getSessionManager().getRefreshCount() : 0,
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, isAllowedCorsOrigin(origin, options.config));
    },
    methods: ['GET'],
  });

  app.decorate('hub', hub);
  app.decorate('appConfig', options.config);
  app.decorate('transitProvider', options.provider);
  app.decorate('staticStore', staticStore);

  await registerRoutes(app);

  app.addHook('onReady', async () => {
    app.log.info({ provider: options.provider.id }, 'provider activated');
    const hadCache = await staticStore.loadFromCache();
    app.log.info(
      { hadCache, staticState: staticStore.getStaticDataState() },
      'static dataset bootstrapped from disk',
    );
    if (!hadCache) {
      await staticStore.refresh();
    } else {
      void staticStore.refresh().catch((error) => {
        app.log.warn(
          { err: error instanceof Error ? error.message : 'error' },
          'static background refresh failed',
        );
      });
    }
    await hub.primeCatalog();
    if (options.startPolling !== false) {
      hub.start();
    }
  });

  app.addHook('onClose', async () => {
    staticStore.beginShutdown();
    hub.stop();
  });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    hub: VehicleHub;
    appConfig: AppConfig;
    transitProvider: RealtimeProvider;
    staticStore: StaticStore;
  }
}
