import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BAHIA_COLECTIVOS_CSV_URL,
  parseMunicipalRouteCsv,
} from '../apps/api/src/lib/opendata.ts';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const outputPath = resolve(projectRoot, 'data/bootstrap/bahia-routes.json');
const response = await fetch(BAHIA_COLECTIVOS_CSV_URL, {
  headers: { accept: 'text/csv', 'user-agent': 'OpenBahiaTransit/0.1 bootstrap generator' },
  signal: AbortSignal.timeout(20_000),
});

if (!response.ok) {
  throw new Error(`Municipal route dataset unavailable (${response.status})`);
}

const routes = parseMunicipalRouteCsv(await response.text());
if (routes.length === 0) {
  throw new Error('Municipal route dataset did not contain usable routes');
}

const lines = [...new Set(routes.map((route) => route.lineId))].sort().map((id) => ({
  id,
  name: id,
  hasRoutes: true,
  hasRealtime: false,
}));
const stops: [] = [];
const checksum = createHash('sha256').update(JSON.stringify({ routes, stops })).digest('hex');
const dataset = {
  metadata: {
    source: 'bahia-opendata',
    version: checksum.slice(0, 12),
    fetchedAt: new Date().toISOString(),
    checksum,
    schemaVersion: 2,
    attribution: 'Municipio de Bahía Blanca — datos abiertos',
  },
  lines,
  routes,
  stops,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
process.stdout.write(`Wrote ${routes.length} routes across ${lines.length} lines to ${outputPath}\n`);
