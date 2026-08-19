import { describe, expect, it, vi } from 'vitest';
import type { TransitRoute } from '@openbahia/transit-core';
import { createLineSession } from './line-session';

const route503: TransitRoute = {
  id: '503-out',
  lineId: '503',
  direction: 'outbound',
  source: 'test',
  path: [
    { latitude: -38.72, longitude: -62.28 },
    { latitude: -38.72, longitude: -62.24 },
  ],
};

const route504: TransitRoute = {
  id: '504-out',
  lineId: '504',
  direction: 'outbound',
  source: 'test',
  path: [
    { latitude: -38.73, longitude: -62.28 },
    { latitude: -38.73, longitude: -62.24 },
  ],
};

describe('line session race protection', () => {
  it('keeps the latest line when an older static request finishes later', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes('/api/routes?lineId=503')) {
          await new Promise((resolve) => setTimeout(resolve, 120));
          return new Response(JSON.stringify({ data: [route503] }), { status: 200 });
        }
        if (url.includes('/api/routes?lineId=504')) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return new Response(JSON.stringify({ data: [route504] }), { status: 200 });
        }
        if (url.includes('/api/stops')) {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        throw new Error(`unexpected ${url}`);
      }),
    );

    const session = createLineSession();
    const applied: string[] = [];
    void session.loadStatic('503', (state) => {
      applied.push(state.routes[0]?.lineId ?? 'none');
    });
    await session.loadStatic('504', (state) => {
      applied.push(state.routes[0]?.lineId ?? 'none');
    });

    expect(applied.at(-1)).toBe('504');
    expect(applied).not.toContain('503');
    session.destroy();
    vi.unstubAllGlobals();
  });
});
