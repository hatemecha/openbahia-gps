import { loadConfig, ConfigError } from '@openbahia/shared';
import { describe, expect, it } from 'vitest';

describe('loadConfig', () => {
  it('fails fast on invalid REALTIME_REFRESH_MS', () => {
    expect(() =>
      loadConfig({
        ...process.env,
        TRANSIT_PROVIDER: 'mock',
        REALTIME_REFRESH_MS: '-10',
      }),
    ).toThrow(ConfigError);
  });

  it('rejects an unknown provider instead of silently defaulting', () => {
    expect(() =>
      loadConfig({
        ...process.env,
        TRANSIT_PROVIDER: 'not-a-provider',
      }),
    ).toThrow(/TRANSIT_PROVIDER/);
  });

  it('uses defaults when optional values are omitted', () => {
    const config = loadConfig({ TRANSIT_PROVIDER: 'mock', PORT: '3000' });
    expect(config.realtimeRefreshMs).toBe(5_000);
    expect(config.debugEndpoints).toBe(false);
    expect(config.freshness.vehicleVisibleMaxAgeMs).toBe(120_000);
    expect(config.corsAllowedOrigins).toEqual([]);
    expect(config.trustedProxyIps).toEqual([]);
  });

  it('normalizes explicitly configured CORS origins and trusted proxies', () => {
    const config = loadConfig({
      TRANSIT_PROVIDER: 'mock',
      PORT: '3000',
      CORS_ALLOWED_ORIGINS: 'https://map.example.com/, https://admin.example.com',
      TRUSTED_PROXY_IPS: '10.0.0.10, 10.0.0.0/24',
    });
    expect(config.corsAllowedOrigins).toEqual([
      'https://map.example.com',
      'https://admin.example.com',
    ]);
    expect(config.trustedProxyIps).toEqual(['10.0.0.10', '10.0.0.0/24']);
  });
});
