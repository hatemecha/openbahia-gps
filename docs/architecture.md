# Arquitectura

OpenBahía Transit es un monorepo pnpm. El navegador **no** accede a Firebase, GPSBahía ni al portal municipal.

```
GPSBahía realtime → GpsBahiaProvider → LineRealtimeManager → API/SSE → MapLibre
GPSBahía HTML + paradas → GpsBahiaStaticProvider → StaticStore (data/cache) → /api/routes /api/stops
```

## Paquetes

| Paquete | Rol |
| --- | --- |
| `packages/transit-core` | Dominio: `VehiclePosition`, `TransitRoute`, `TransitStop`, geometría, matching, Zod |
| `packages/shared` | Configuración |
| `providers/gpsbahia` | Realtime público + estático (recorridos embebidos, paradas) |
| `providers/gpsbus` | Realtime Firebase (congelado) + estático Storage (fallback) |
| `providers/mock` | Demostración local |
| `apps/api` | Fastify, caché por línea, SSE, importador municipal |
| `apps/web` | SvelteKit + MapLibre |

## Separación realtime / estático

`RealtimeProvider` solo entrega posiciones. `StaticTransitProvider` entrega líneas, recorridos y paradas. El matching vive en el backend (`transit-core`), no dentro del proveedor GPS.

## Realtime por demanda

`VehicleHub` activa una línea cuando hay un GET o un cliente SSE. Mientras hay observadores, refresca cada `REALTIME_REFRESH_MS` (10 s). Si nadie mira, sigue caliente `REALTIME_IDLE_TTL_MS` (120 s) y deja de consultar. Máximo `REALTIME_MAX_ACTIVE_LINES` (8). Cien clientes en la 503 = una sola petición upstream (single-flight + caché).

La sesión de GPSBahía (`GpsBahiaSessionManager`) se reutiliza. No se crea una sesión por poll. Token inválido o sesión vacía: renovar y reintentar **una** vez.

## Estático

Al arrancar, el `StaticStore` prueba en este orden, sin mezclar puntos de fuentes distintas:

1. GPSBahía (HTML `data-recorridos` + `POST /web2/get_paradas`)
2. gpsbus Storage público (`versions.json` → archivo de esa versión)
3. CSV municipal de datos.bahia.gob.ar

El resultado se guarda en `data/cache/` (gitignore) con `schemaVersion` + checksum. Escritura atómica (temp + fsync + rename). Sin red, se usa el último dataset válido **del mismo origen** (no se salta a gpsbus si el caché de GPSBahía sigue siendo válido).

## Modelo

- `lineId` / `routeId` públicos: número de línea (`503`)
- `matchedRouteId`: geometría (`gb-11`)
- `direction`: `outbound` (IDA) / `inbound` (VUELTA) / `unknown`
- Campos derivados: `routeProgress`, `routeConfidence`, `matchedLatitude`, `nextStop`, `routeAssignmentSource`, `positionKind`, `routeMatchState`
- Estados: `realtimeState`, `staticDataState` (ver [error-model.md](error-model.md))

## Teselas

Estilo `https://tiles.openfreemap.org/styles/liberty`. Atribuir OSM / OpenFreeMap.

## Logging

Pino con `req.id`. No se registran cookies, tokens ni URLs con token. Sí: session refresh, circuit breaker, fallos de proveedor, fallback estático, coordenadas inválidas, outliers relevantes.
