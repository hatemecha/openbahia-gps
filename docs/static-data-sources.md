# Fuentes estáticas — recorridos y paradas

Última verificación: **2026-08-19**. Leyenda: **hecho** / **hipótesis**.

OpenBahía no mezcla vértices de fuentes distintas en un mismo dataset. Elige una fuente completa y deja las otras como fallback.

## GPSBahía (preferida)

| Campo | Valor |
| --- | --- |
| Recorridos | **Hecho:** el HTML público de https://www.gpsbahia.com.ar/ embebe `data-recorridos` en cada `<option>` de línea. Cada ítem tiene `Id`, `linea_id`, `tipo` (`ida`/`vuelta`) y `path` como lista de `"lat,lng"`. |
| Paradas | **Hecho:** `POST https://www.gpsbahia.com.ar/web2/get_paradas` responde JSON público (~4000 paradas) con o sin cookie. Incluye `nombre`, `latLng`, `sentido` y `lineas`. |
| Encaje con GPS | **Hecho:** `linea_id` y `direccion` del track coinciden con el catálogo y con `tipo` de recorrido. |
| Frecuencias | No se encontró un feed público usable de frecuencias en esta investigación. |

Por eso GPSBahía es la fuente **primaria** de geometría: los IDs calzan con el realtime.

## gpsbus / ColectivosYa (fallback)

Código de referencia: https://github.com/corzofederico/gpsbus-web (`src/conections/routes.ts`, `stops.ts`, `versions.ts`).

| Campo | Valor |
| --- | --- |
| Versions | **Hecho:** `GET` público de Firebase Storage `api/routes/versions.json` → `{"1":31,"2":83}` el 2026-08-19. Nunca hardcodear la versión. |
| Recorridos | **Hecho:** `api/routes/v2/routes.83.json` es legible (~54 rutas, paths densos, `direction: going\|returning`, `group` para ramales). |
| Paradas | **Hecho:** `api/stops/versions.json` → format 1 versión 95. |
| Realtime | El feed de posiciones en Firebase sigue congelado (julio 2026). Eso **no** invalida los archivos estáticos. |

El navegador de OpenBahía nunca habla con Firebase. Solo el backend, si GPSBahía estático falla.

## Datos abiertos municipales (fallback + atribución)

Portal: https://datos.bahia.gob.ar/ dataset «Recorrido de Colectivos».

| Campo | Valor |
| --- | --- |
| CSV | **Hecho:** WKT `LINESTRING` con nombres `500 Ida` / `500 Vuelta`. ~93 KB. |
| KMZ | Existe; OpenBahía no lo parsea en el frontend. El backend usa CSV. |
| Paradas | Este dataset no cubre paradas. |
| Licencia | Portal de datos abiertos municipal. Atribuir al Municipio de Bahía Blanca. El código AGPL-3.0-only no otorga derecho a republicar el CSV. |

## Resolución automática

1. Si hay caché válido (schema + checksum) se usa de inmediato.
2. Se intenta refrescar **la misma fuente** del caché. Si falla, se conserva el caché (sin flap a gpsbus).
3. Solo sin caché usable: GPSBahía → gpsbus Storage → CSV municipal.

`metadata.json` guarda `{ source, version, fetchedAt, checksum, schemaVersion }`. Escritura atómica.

## Bootstrap versionado

`data/bootstrap/bahia-routes.json` permite servir recorridos municipales en un primer arranque sin red. Se regenera de forma reproducible con `pnpm bootstrap:static`, usando el parser municipal que usa la API. El archivo no agrega paradas: el dataset municipal no las publica.
