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

Para probar simultáneamente en esta computadora y en un celular con GPS, ejecutá un solo comando:

```bash
pnpm dev:share
```

Imprime una URL local, una URL HTTPS y un QR para abrir desde el teléfono. `Ctrl+C` cierra todo lo que inició el comando; si reutilizó un `pnpm dev` previo, ese proceso original sigue activo.

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`. Smoke opcional contra GPS real: `pnpm test:live` (no corre en CI).

## Estado alpha

El proyecto sigue en **alpha**. El objetivo de esta etapa es que el flujo básico sea confiable: elegir una línea, ver su recorrido y ver únicamente ubicaciones suficientemente recientes y plausibles para esa línea.

Para reproducibilidad y CI, `pnpm test` y `pnpm test:e2e` usan `MockProvider` y no consultan GPS real. El smoke contra GPS real (`pnpm test:live`) es opcional.

## Qué muestra

Elegís una línea (por ejemplo 503) y ves:

- traza **IDA** y **VUELTA**
- unidades con una posición reciente y compatible con el recorrido cuando hay geometría disponible
- paradas de esa línea
- sentido calculado con fuente, rumbo, geometría y continuidad; si no hay evidencia suficiente, no se publica la unidad
- próxima parada solamente cuando el matching es confiable

La ubicación del usuario (**Mi ubicación**) se pide solo al tocar el botón, queda en el teléfono y **no** se envía al backend. Se solicita GPS de alta precisión sin reutilizar caché. La primera lectura centra el mapa con un zoom acorde a su margen de error; una lectura aproximada se muestra con un halo grande mientras llega otra mejor. Si el usuario mueve el mapa, la app deja de recentrar automáticamente. Para futuras funciones de navegación, `isNavigationReadyLocation` exige un error informado de 30 m o menos.

## Proveedor realtime

`TRANSIT_PROVIDER` en `.env`:

| Valor      | Qué hace                                                                          |
| ---------- | --------------------------------------------------------------------------------- |
| `gpsbahia` | **Predeterminado.** Consume el feed público usado por el cliente web de GPSBahía. |
| `gpsbus`   | Firebase RTDB de ColectivosYa. Se conserva como provider alternativo.             |
| `mock`     | Demostración local. La UI indica que no son datos reales.                         |

## Arquitectura

```text
GPSBahía track_data → GpsBahiaProvider → VehicleHub → REST/SSE → MapLibre
GPSBahía recorridos/paradas → StaticStore → /api/routes /api/stops
```

Polling por demanda: una línea se consulta aproximadamente cada 5 s mientras tiene clientes activos, con cache y single-flight para no multiplicar requests upstream.

## Criterio de publicación de posiciones

OpenBahía conserva las coordenadas GPS originales en la respuesta. Para dibujar el marker puede usar el punto más cercano del recorrido únicamente cuando el matching es fuerte (≤45 m y confianza ≥0.68), igual que el criterio de intersección de recorrido usado por ColectivosYa.

Antes de publicar una unidad se descartan:

- fixes más viejos que la ventana configurada (`VEHICLE_VISIBLE_MAX_AGE_MS`)
- saltos GPS físicamente implausibles
- posiciones `uncertain` u `off-route` cuando existe una geometría válida

La ventana predeterminada es de 2 minutos. Solo se muestran matches confiables; si una línea todavía no tiene geometría, se conserva el GPS reciente y válido en vez de ocultar todo el servicio.

## Datos reales vs derivados

- **GPS:** latitud/longitud observadas por el provider.
- **Sentido:** `direccion` se usa como prior; rumbo, geometría y continuidad pueden corregirlo cuando la evidencia es fuerte.
- **Matching:** conserva el GPS crudo, pero la presentación usa el punto ajustado solo con evidencia fuerte; progreso y próxima parada siguen siendo derivados.
- **Recorridos/paradas:** datos estáticos cacheados en `data/cache/`.

## Privacidad y servicios externos

- OpenBahía no incluye telemetría propia ni cuentas de usuario.
- La ubicación personal se procesa únicamente en el navegador y no se envía a la API.
- La API consulta GPSBahía y, como fallback configurable, los endpoints públicos de gpsbus/Firebase documentados en [docs/data-sources.md](docs/data-sources.md).
- El mapa descarga teselas y estilos de OpenFreeMap/OpenStreetMap.
- `pnpm dev:share` usa LocalTunnel solo durante esa sesión de desarrollo; la URL es pública y temporal, y `Ctrl+C` la cierra.

## Licencias

- Código: **AGPL-3.0-only**. Las interfaces enlazan al código fuente correspondiente.
- Datos de GPSBahía / gpsbus: no asumir licencia de redistribución. Caché local, gitignore.
- Dataset municipal de recorridos: atribuir al Municipio de Bahía Blanca.
- Teselas: OSM / OpenFreeMap.

Ver [docs/data-sources.md](docs/data-sources.md).

## Contribuciones y seguridad

Issues y pull requests son bienvenidos siguiendo [CONTRIBUTING.md](CONTRIBUTING.md). Es un proyecto personal en estado alpha: no hay garantía de soporte ni tiempos de respuesta. Las vulnerabilidades se reportan según [SECURITY.md](SECURITY.md), preferentemente mediante GitHub Security Advisories.

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
