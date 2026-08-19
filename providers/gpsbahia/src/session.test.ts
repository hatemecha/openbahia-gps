import { describe, expect, it } from 'vitest';
import { GpsBahiaSessionManager } from './session.js';

describe('GpsBahiaSessionManager', () => {
  it('reuses a public session instead of fetching the homepage every time', async () => {
    let homepageHits = 0;
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('gpsbahia')) {
        homepageHits += 1;
        return new Response("<html><script>var vgggaxqq = 'abc123def456';</script></html>", {
          status: 200,
          headers: { 'set-cookie': 'ci_session=testcookie; Path=/' },
        });
      }
      return new Response('no', { status: 404 });
    };
    const sessions = new GpsBahiaSessionManager({
      fetchImpl,
      ttlMs: 60_000,
    });
    const first = await sessions.getSession();
    const second = await sessions.getSession();
    expect(first.token).toBe('abc123def456');
    expect(first.cookie).toContain('ci_session=testcookie');
    expect(second.token).toBe(first.token);
    expect(homepageHits).toBe(1);
    expect(sessions.getRefreshCount()).toBe(1);
  });

  it('renews once after invalidation', async () => {
    let homepageHits = 0;
    const fetchImpl: typeof fetch = async () => {
      homepageHits += 1;
      return new Response(`<html><script>var vgggaxqq = '${homepageHits}aaaaaaaaaa';</script></html>`, {
        status: 200,
        headers: { 'set-cookie': 'ci_session=x; Path=/' },
      });
    };
    const sessions = new GpsBahiaSessionManager({ fetchImpl, ttlMs: 60_000 });
    await sessions.getSession();
    sessions.invalidate();
    await sessions.getSession();
    expect(homepageHits).toBe(2);
    expect(sessions.getRefreshCount()).toBe(2);
  });

  it('backs off after homepage failures instead of retrying instantly', async () => {
    let hits = 0;
    const fetchImpl: typeof fetch = async () => {
      hits += 1;
      return new Response('nope', { status: 503 });
    };
    const sessions = new GpsBahiaSessionManager({ fetchImpl, ttlMs: 60_000 });
    await expect(sessions.getSession()).rejects.toThrow();
    expect(sessions.getState()).toBe('backoff');
    await expect(sessions.getSession()).rejects.toThrow();
    expect(hits).toBe(1);
  });
});
