import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseGpsBahiaRoutes, parseGpsBahiaStops, parseHomepageLineOptions, resolveCurrentGpsBahiaLine } from './parse-static.js';

const root = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(root, '../fixtures/homepage-sample.html'), 'utf8');
const stopsRaw = JSON.parse(readFileSync(join(root, '../fixtures/stops-503-sample.json'), 'utf8')) as unknown;

describe('gpsbahia static parser', () => {
  it('parses outbound and inbound geometries from public homepage HTML', () => {
    const options = parseHomepageLineOptions(html);
    expect(options.map((option) => option.name)).toEqual(['503', '504']);
    const routes = parseGpsBahiaRoutes(html);
    const line503 = routes.filter((route) => route.lineId === '503');
    expect(line503).toHaveLength(2);
    expect(line503.map((route) => route.direction).sort()).toEqual(['inbound', 'outbound']);
    expect(line503[0]?.path.length).toBeGreaterThan(20);
    expect(line503[0]?.path[0]?.latitude).toBeLessThan(0);
    expect(line503[0]?.path[0]?.longitude).toBeLessThan(0);
    expect(line503[0]?.source).toBe('gpsbahia');
  });

  it('attaches named stops to matching route ids', () => {
    const routes = parseGpsBahiaRoutes(html);
    const stops = parseGpsBahiaStops(stopsRaw, routes);
    expect(stops.length).toBeGreaterThan(5);
    expect(stops[0]?.name).toMatch(/ARIAS|RONDEAU|RODRIGUEZ|ZELARRAYAN|ALEM/i);
    const with503 = stops.filter((stop) =>
      stop.routeIds.some((id) => routes.some((route) => route.id === id && route.lineId === '503')),
    );
    expect(with503.length).toBeGreaterThan(3);
  });

  it('maps 506 and 513 from the homepage fixture and prefers homepage over hardcoded ids', () => {
    const html = readFileSync(join(root, '../fixtures/homepage-line-map.html'), 'utf8');
    expect(resolveCurrentGpsBahiaLine('506', html)?.rawRouteId).toBe('9');
    expect(resolveCurrentGpsBahiaLine('513', html)?.rawRouteId).toBe('12');
    expect(resolveCurrentGpsBahiaLine('506', null)?.rawRouteId).toBe('9');
    expect(resolveCurrentGpsBahiaLine('513', undefined)?.rawRouteId).toBe('12');
    const override =
      `<select><option value="77" data-recorridos='[{"Id":"1","linea_id":"77","tipo":"ida","path":["-38.7,-62.2","-38.71,-62.21"]}]'>506</option></select>`;
    expect(resolveCurrentGpsBahiaLine('506', override)?.rawRouteId).toBe('77');
    expect(parseHomepageLineOptions(html).map((option) => option.name)).toEqual(['506', '513', '599']);
  });
});
