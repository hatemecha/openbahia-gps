# OpenBahía Transit

Mapa abierto de colectivos de **Bahía Blanca**: GPS en vivo, recorridos de ida/vuelta, paradas y sentido, sin pedir acceso especial a nadie.

El frontend nunca habla con GPSBahía ni con Firebase. Todo pasa por nuestro backend.

## Cómo ejecutar

Requisitos: Node.js 22+ y [pnpm](https://pnpm.io/).

```bash
cp .env.example .env
pnpm install
pnpm dev
```

- Web: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:3000](http://localhost:3000)

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`. Smoke opcional contra GPS real: `pnpm test:live` (no corre en CI).

## Estado alpha (y qué esperar)
Este repo es una **alpha**: está diseñado para ser resiliente ante fallos de sesión/caché y errores upstream, pero todavía puede haber limitaciones en flujos concretos cuando se usa GPS real.

Para reproducibilidad (y desarrollo en CI), usá `pnpm test` y `pnpm test:e2e`: el realtime en ese caso usa `MockProvider` (no llama a GPS real).
El smoke contra GPS real (`pnpm test:live`) es opcional y puede fallar o ser omitido.

## Qué muestra

Elegís una línea (por ejemplo 503) y ves:

- traza **IDA** y **VUELTA**
- colectivos sobre esas trazas, con sentido cuando la fuente o el matching lo permiten
- paradas de esa línea
- posición GPS real y última actualización
- próxima parada en metros (sin ETA)

La ubicación del usuario (**Mi ubicación**) se pide solo al tocar el botón, queda en el teléfono y **no** se envía al backend.

## Proveedor realtime

`TRANSIT_PROVIDER` en `.env`:

| Valor | Qué hace |
| --- | --- |
| `gpsbahia` | **Predeterminado.** Cliente web público de GPSBahía. Verificado en vivo. |
| `gpsbus` | Firebase RTDB de ColectivosYa. Legible, pero las marcas de tiempo estaban congeladas el 2026-07-18. |
| `mock` | Demostración local. La UI dice **Modo demostración**. |

El realtime de gpsbus congelado **no** impide usar sus archivos estáticos públicos como fallback de recorridos.

## Arquitectura

```
GPSBahía track_data → GpsBahiaProvider → VehicleHub (por línea) → REST/SSE → MapLibre
GPSBahía recorridos/paradas → StaticStore → /api/routes /api/stops
```

Polling por demanda: una línea se consulta ~cada 10 s solo mientras hay clientes (o 2 min extra). Máximo 8 líneas activas. 100 usuarios en la 503 = 1 request upstream.

## Datos reales vs derivados

- **GPS:** observado (lat/lng originales siempre en la API).
- **Sentido:** si GPSBahía manda `direccion`, se usa. Si no, matching. Si no hay confianza: «Sentido sin determinar».
- **Posición sobre la calle:** opcional, solo con confianza alta.
- **Recorridos/paradas:** estáticos, cacheados en `data/cache/` (no se redistribuyen en git).

## Licencias

- Código: **AGPL-3.0**.
- Datos de GPSBahía / gpsbus: no asumir licencia de redistribución. Caché local, gitignore.
- Dataset municipal de recorridos: atribuir al Municipio de Bahía Blanca.
- Teselas: OSM / OpenFreeMap.

Ver [docs/data-sources.md](docs/data-sources.md).

## Documentación

- [docs/architecture.md](docs/architecture.md)
- [docs/realtime-sources.md](docs/realtime-sources.md)
- [docs/static-data-sources.md](docs/static-data-sources.md)
- [docs/map-matching.md](docs/map-matching.md)
- [docs/data-sources.md](docs/data-sources.md)
- [docs/development.md](docs/development.md)
- [docs/reliability.md](docs/reliability.md)
- [docs/accessibility.md](docs/accessibility.md)
- [docs/error-model.md](docs/error-model.md)
- [docs/hardening-audit.md](docs/hardening-audit.md)
