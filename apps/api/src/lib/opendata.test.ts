import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMunicipalRouteCsv } from './opendata.js';

const csv = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/recorrido-sample.csv'), 'utf8');

describe('municipal open data parser', () => {
  it('converts CSV WKT recorridos into outbound/inbound paths', () => {
    const routes = parseMunicipalRouteCsv(csv);
    expect(routes.length).toBe(3);
    const ida = routes.find((route) => route.lineId === '500' && route.direction === 'outbound');
    expect(ida?.path.length).toBe(3);
    expect(ida?.path[0]?.longitude).toBeCloseTo(-62.2663, 4);
    expect(ida?.source).toBe('bahia-opendata');
  });

  it('accepts the current municipal export suffix and 3D WKT points', () => {
    const routes = parseMunicipalRouteCsv(
      'name,description,tessellate,WKT;;\n"500 Ida,""RECORRIDO"",""true"",""LINESTRING Z (-62.2663 -38.7183 0, -62.2721 -38.7142 0)""";;\n',
    );
    expect(routes).toHaveLength(1);
    expect(routes[0]?.path[0]).toEqual({ latitude: -38.7183, longitude: -62.2663 });
  });
});
