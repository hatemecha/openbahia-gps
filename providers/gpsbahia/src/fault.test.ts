import { describe, expect, it } from 'vitest';
import { GpsBahiaProvider } from './index.js';

describe('GpsBahiaProvider fault injection', () => {
  it('does not crash on HTML instead of JSON', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('track_data')) {
        return new Response('<html>login</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      return new Response("<html><script>var vgggaxqq = 'abc123def456';</script></html>", {
        status: 200,
        headers: { 'set-cookie': 'ci_session=testcookie; Path=/' },
      });
    };
    const provider = new GpsBahiaProvider({ fetchImpl });
    await expect(provider.getVehicles({ lineId: '503' })).rejects.toThrow();
  });

  it('retries once after an invalid session payload', async () => {
    let tracks = 0;
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('track_data')) {
        tracks += 1;
        if (tracks === 1) {
          return new Response(JSON.stringify({ status: 'ok', token: 'ok', data: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ status: 'ok', data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response("<html><script>var vgggaxqq = 'abc123def456';</script></html>", {
        status: 200,
        headers: { 'set-cookie': 'ci_session=testcookie; Path=/' },
      });
    };
    const provider = new GpsBahiaProvider({ fetchImpl });
    const vehicles = await provider.getVehicles({ lineId: '503' });
    expect(vehicles).toEqual([]);
    expect(tracks).toBe(2);
  });

  it('requests the homepage raw route id for 513 instead of the hardcoded fallback', async () => {
    const requested: string[] = [];
    const homepage = `<html><script>var vgggaxqq = 'abc123def456';</script><select><option value="88" data-recorridos='[{"Id":"1","linea_id":"88","tipo":"ida","path":["-38.7,-62.2","-38.71,-62.21"]}]'>513</option></select></html>`;
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('track_data')) {
        requested.push(url);
        return new Response(JSON.stringify({ status: 'ok', data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(homepage, {
        status: 200,
        headers: { 'set-cookie': 'ci_session=testcookie; Path=/' },
      });
    };
    const provider = new GpsBahiaProvider({ fetchImpl });
    await provider.getVehicles({ lineId: '513' });
    expect(requested.some((url) => url.includes('/track_data/88.json'))).toBe(true);
    expect(requested.some((url) => url.includes('/track_data/12.json'))).toBe(false);
  });
});
