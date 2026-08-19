# Desarrollo

## Requisitos

- Node.js 22
- pnpm 11

## Arranque

```bash
cp .env.example .env
pnpm install
pnpm dev
```

La API carga `.env` desde la raíz del monorepo y luego `apps/api/.env` si existiera.

Al arrancar descarga (o revalida) recorridos y paradas hacia `data/cache/`. Ese directorio no se commitea.

## Tests

```bash
pnpm test
pnpm test:e2e
pnpm test:live
pnpm lint
pnpm typecheck
```

Vitest. Parsers y matching usan fixtures locales. Sin red.

`pnpm test:e2e` (Playwright + axe) usa **MockProvider**, no GPS en vivo.

`pnpm test:live` es un smoke conservador (1–2 líneas GPSBahía). PASS/FAIL/SKIP. No forma parte del CI habitual.

## Proveedores

- Realtime: `RealtimeProvider` (`gpsbahia` | `gpsbus` | `mock`).
- Estático: `StaticTransitProvider`. GPSBahía primero, gpsbus Storage después, CSV municipal al final.
- Un proveedor caído no tumba Fastify. Health lee estado cacheado, no llama upstream.

Selector: `apps/api/src/lib/providers.ts`.

## Frontend

SvelteKit 2 + Svelte 5. MapLibre en el cliente. Recorridos y paradas son capas GeoJSON.

Modo debug: `http://localhost:5173/?debug=1` (proveedor, confianza, ids internos).

`GET /api/debug/status` solo si `DEBUG_ENDPOINTS=true`.

## SSE

`GET /api/realtime/vehicles?lineId=503` (`routeId` sigue siendo alias). Si EventSource falla, el cliente hace polling con backoff (no cada 5 s infinito). Al volver de segundo plano, se sincroniza.
