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
    expect(config.realtimeRefreshMs).toBe(10_000);
    expect(config.debugEndpoints).toBe(false);
  });
});
