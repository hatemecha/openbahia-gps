import { loadConfig } from '@openbahia/shared';
import { MockProvider } from '@openbahia/provider-mock';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

describe('API with MockProvider', () => {
  const config = loadConfig({
    ...process.env,
    TRANSIT_PROVIDER: 'mock',
    PORT: '3000',
    STATIC_CACHE_DIR: mkdtempSync(join(tmpdir(), 'openbahia-cache-')),
  });
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({
      config,
      provider: new MockProvider(() => Date.parse('2026-08-19T12:00:00.000Z')),
      startPolling: false,
      logger: false,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      status: string;
      provider: string;
      realtime: { provider: string };
      static: { routes: number; stops: number };
    };
    expect(body.status).toBe('ok');
    expect(body.provider).toBe('mock');
    expect(body.realtime.provider).toBe('mock');
    expect(body.static.routes).toBeGreaterThan(0);
  });

  it('GET /api/lines includes route availability without probing realtime', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/lines' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: Array<{ id: string; hasRoutes?: boolean; hasRealtime?: boolean }> };
    expect(body.data.some((line) => line.id === '503' && line.hasRoutes)).toBe(true);
  });

  it('GET /api/routes?lineId=503', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/routes?lineId=503' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: Array<{ lineId: string; path: unknown[] }> };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]?.lineId).toBe('503');
    expect(body.data[0]?.path.length).toBeGreaterThan(1);
  });

  it('GET /api/routes?lineId=503&format=geojson', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/routes?lineId=503&format=geojson' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { type: string; features: unknown[] };
    expect(body.type).toBe('FeatureCollection');
    expect(body.features.length).toBeGreaterThan(0);
  });

  it('GET /api/vehicles', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/vehicles' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      data: unknown[];
      meta: { provider: string; count: number; connectionState: string };
    };
    expect(body.meta.provider).toBe('mock');
    expect(body.meta.connectionState).toBe('demo');
    expect(body.meta.count).toBeGreaterThan(0);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('GET /api/vehicles?routeId=503', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/vehicles?routeId=503' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: Array<{ routeId?: string; lineId?: string }>; meta: { count: number } };
    expect(body.data.every((item) => item.lineId === '503' || item.routeId === '503')).toBe(true);
    expect(body.meta.count).toBe(2);
  });

  it('GET /api/ready is 200 when static data is present', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects garbage line ids', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/vehicles?lineId=<script>' });
    expect(response.statusCode).toBe(400);
  });
});
