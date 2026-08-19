import { GpsBahiaProvider, GpsBahiaSessionManager, GpsBahiaStaticProvider } from '@openbahia/provider-gpsbahia';
import { GpsBusProvider, GpsBusStaticProvider } from '@openbahia/provider-gpsbus';
import { MockProvider, MockStaticProvider } from '@openbahia/provider-mock';
import type { AppConfig } from '@openbahia/shared';
import { assertNever, type ProviderId, type RealtimeProvider, type StaticTransitProvider } from '@openbahia/transit-core';
import { BahiaOpenDataProvider, BAHIA_COLECTIVOS_CSV_URL } from './opendata.js';

export function createSessionManager(config: AppConfig): GpsBahiaSessionManager {
  return new GpsBahiaSessionManager({
    baseUrl: config.gpsbahiaBaseUrl,
    userAgent: config.userAgent,
  });
}

export function createProvider(
  config: AppConfig,
  id: ProviderId = config.provider,
  session = createSessionManager(config),
): RealtimeProvider {
  switch (id) {
    case 'mock':
      return new MockProvider();
    case 'gpsbus':
      return new GpsBusProvider({
        databaseUrl: config.gpsbusDatabaseUrl,
        cityKey: config.gpsbusCityKey,
        userAgent: config.userAgent,
      });
    case 'gpsbahia':
      return new GpsBahiaProvider({
        baseUrl: config.gpsbahiaBaseUrl,
        userAgent: config.userAgent,
        session,
      });
    default:
      return assertNever(id);
  }
}

export function createStaticProviders(
  config: AppConfig,
  realtime: RealtimeProvider,
  session = createSessionManager(config),
): StaticTransitProvider[] {
  if (realtime.id === 'mock') {
    return [new MockStaticProvider()];
  }
  return [
    new GpsBahiaStaticProvider({
      baseUrl: config.gpsbahiaBaseUrl,
      userAgent: config.userAgent,
      session,
    }),
    new GpsBusStaticProvider({ userAgent: config.userAgent }),
    new BahiaOpenDataProvider(BAHIA_COLECTIVOS_CSV_URL, fetch, config.userAgent),
  ];
}
