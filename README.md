# OpenBahía Transit

Mapa abierto de colectivos de **Bahía Blanca**: ubicación de unidades, recorridos de ida/vuelta, paradas y sentido, sin pedir acceso especial a nadie.

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

## Estado alpha

El proyecto sigue en **alpha**. El objetivo de esta etapa es que el flujo básico sea confiable: elegir una línea, ver su recorrido y ver únicamente ubicaciones suficientemente recientes y plausibles para esa línea.

Para reproducibilidad y CI, `pnpm test` y `pnpm test:e2e` usan `MockProvider` y no consultan GPS real. El smoke contra GPS real (`pnpm test:live`) es opcional.

## Qué muestra

Elegís una línea (por ejemplo 503) y ves:

- traza **IDA** y **VUELTA**
- unidades con una posición reciente y compatible con el recorrido cuando hay geometría disponible
- paradas de esa línea
- sentido informado por la fuente cuando está disponible
- próxima parada solamente cuando el matching es confiable

La ubicación del usuario (**Mi ubicación**) se pide solo al tocar el botón, queda en el teléfono y **no** se envía al backend.

## Proveedor realtime

`TRANSIT_PROVIDER` en `.env`:

| Valor | Qué hace |
| --- | --- |
| `gpsbahia` | **Predeterminado.** Consume el feed público usado por el cliente web de GPSBahía. |
| `gpsbus` | Firebase RTDB de ColectivosYa. Se conserva como provider alternativo. |
| `mock` | Demostración local. La UI indica que no son datos reales. |

## Arquitectura

```text
GPSBahía track_data → GpsBahiaProvider → VehicleHub → REST/SSE → MapLibre
GPSBahía recorridos/paradas → StaticStore → /api/routes /api/stops
```

Polling por demanda: una línea se consulta aproximadamente cada 5 s mientras tiene clientes activos, con cache y single-flight para no multiplicar requests upstream.

## Criterio de publicación de posiciones

OpenBahía conserva las coordenadas GPS originales; el map matching no mueve el marker público.

Antes de publicar una unidad se descartan:

- fixes más viejos que la ventana configurada (`VEHICLE_VISIBLE_MAX_AGE_MS`)
- saltos GPS físicamente implausibles
- posiciones de GPSBahía claramente fuera del recorrido cuando existe una geometría válida para esa línea

Si el recorrido no está disponible, la ausencia de matching no oculta una posición reciente y válida.

## Datos reales vs derivados

- **GPS:** latitud/longitud observadas por el provider.
- **Sentido:** si GPSBahía manda `direccion`, se conserva como dato autoritativo.
- **Matching:** solo metadata para progreso/próxima parada; no altera la posición pública.
- **Recorridos/paradas:** datos estáticos cacheados en `data/cache/`.

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
