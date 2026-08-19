# Fuentes de tiempo real — Bahía Blanca

Última verificación de este documento: **2026-08-19**.  
Leyenda: **hecho** = observado en esta investigación; **hipótesis** = no verificado.

Ninguna de estas fuentes es GTFS-Realtime oficial. OpenBahía Transit las encapsula detrás de providers propios.

---

## GPSBahía

| Campo | Valor |
| --- | --- |
| Estado | **Activo** (hecho) |
| Acceso | Sitio web público https://www.gpsbahia.com.ar/ — sin login de usuario |
| Tipo | Cliente web municipal de movilidad (marca Nixel en el HTML) |
| Formato | JSON `{ status, data: [{ interno, angle, dt_tracker, dt_server, lat, lng, imei, direccion, name }] }` |
| Realtime | Sí (hecho, 2026-08-19) |
| Frecuencia | El JS público vuelve a pedir la línea seleccionada de forma periódica; no medimos el intervalo exacto del sitio (hipótesis: ~5 s, como el poller 2018) |
| Licencia conocida | No publicada como dato abierto. Sitio institucional. Teselas del mapa IGN en el cliente original |
| Dependencia | Municipio de Bahía Blanca + Nixel (`nixel.com.ar`, app `ar.com.nixel.GPSBahia`) |
| Riesgo | Contrato no documentado; token de página `vgggaxqq`; cookie `ci_session`; puede cambiar sin aviso |
| Fecha de última verificación | 2026-08-19 |
| Notas | Ver detalle abajo |

### Hechos

- El HTML público incluye `var base_url = 'https://www.gpsbahia.com.ar/'` y `var vgggaxqq = '<hex>'`.
- El JS minificado (`/assets_app/js/app.min.js`) hace `POST {base_url}app/track_data/{linea_id}.json?vggaxqq={vgggaxqq}`.
- Sin cookie de sesión, la misma URL respondió `{ status: "ok", token: "ok", data: [] }` (hecho).
- Con `ci_session` obtenida al GET de la homepage, línea `6` (503) devolvió **9 vehículos** con `dt_tracker` del 2026-08-19 ~12:21 UTC, coincidente con el reloj de la prueba.
- Cada vehículo incluye `direccion: "ida"|"vuelta"` (**hecho**). OpenBahía lo mapea a outbound/inbound y no lo infiere si ya vino en el JSON.
- `{ status: "ok", token: "ok", data: [] }` **sin** cookie es sesión inválida, no “línea vacía”. `{ status: "ok", data: [] }` **sin** campo `token` se trata como línea sin unidades.
- El endpoint histórico `GET /web/get_track_data/{linea}/{hash}` responde `{"status":"error","error":"invalidToken"}`. Ya no es un feed usable como en 2018.
- Los `linea_id` del `<select>` coinciden con los IDs usados por ColectivosYa (`6` = 503, `7` = 504, …). Eso **no** prueba que compartan backend.

### Hipótesis

- GPSBahía y gpsbus/Firebase podrían alimentarse de la misma flota (IMEIs coinciden en muestras: p.ej. `865413057162363`). No se afirma identidad de sistemas.
- `dt_tracker` está en UTC: el JS del sitio hace `moment(dt_tracker).subtract(3, "hours")` para mostrar hora argentina.

### Qué no hacemos

No pedimos credenciales ni acceso especial. Si el contrato público cambia, el proveedor falla de forma explícita y se usa caché o mock.

---

## ColectivosYa / gpsbus

| Campo | Valor |
| --- | --- |
| Estado | Cliente web activo; feed Firebase **legible pero congelado** el 2026-08-19 |
| Acceso | App pública https://colectivos.corzo.ar/ — código Apache-2.0 en https://github.com/corzofederico/gpsbus-web |
| Tipo | Firebase Realtime Database + Firebase Storage (recorridos/paradas/horarios) |
| Formato | `/buses/bhi/{lineaId}/{vehicleId}/history[]` con `{ angle, date, position: { lat, lng } }` |
| Realtime | El cliente usa `onValue`. El 2026-08-19 un GET REST público devolvió 101 vehículos cuya `date` máxima era **2026-07-18T22:40:11Z** (~31 días de antigüedad) |
| Frecuencia | No observable como push vivo en la fecha de prueba |
| Licencia conocida | Código Apache-2.0. Los datos de flota no tienen licencia abierta declarada |
| Dependencia | Proyecto de Federico Corzo; Firebase projectId público `gps-bus-7811f` |
| Riesgo | Rules de Firebase pueden cerrar el `.read`; el espejo puede dejar de actualizarse |
| Fecha de última verificación | 2026-08-19 |
| Notas | Config de Firebase **client** está en el repo público. No es Admin SDK ni secreto |

### Hechos

- `GET https://gps-bus-7811f-default-rtdb.firebaseio.com/buses.json?shallow=true` → `{"bhi":true}` sin autenticación.
- Path de colectivos: `/buses/bhi/{rawRouteId}`.
- Storage paths públicos en el código: `/api/routes/...`, `/api/stops/...`. OpenBahía puede usarlos como **estático** de fallback; el realtime Firebase no.

### Hipótesis

- gpsbus podría estar ingestando GPSBahía u otra fuente municipal. IDs de línea e IMEIs coinciden en muestras, pero **no** se verificó un backend compartido.

---

## Municipio

| Campo | Valor |
| --- | --- |
| Estado | Datos abiertos **estáticos** de recorridos; no hay API realtime |
| Acceso | https://datos.bahia.gob.ar/ y https://gobiernoabierto.bahia.gob.ar/movilidad/colectivos/ |
| Tipo | KMZ / CSV de recorridos |
| Formato | Geo estático, no posiciones de unidades |
| Realtime | No |
| Frecuencia | Actualización de dataset desconocida |
| Licencia conocida | Portal de datos abiertos municipal (revisar cada dataset) |
| Dependencia | Municipio de Bahía Blanca |
| Riesgo | No cubre el PoC de GPS en vivo |
| Fecha de última verificación | 2026-08-19 |
| Notas | Importado como fallback de recorridos. Ver [static-data-sources.md](static-data-sources.md). |

---

## SAPEM

| Campo | Valor |
| --- | --- |
| Estado | Mencionado históricamente (“GPS Bahía SAPEM 2017”) |
| Acceso | No se encontró API pública propia en esta investigación |
| Tipo | Operador / marca histórica del sistema GPS municipal |
| Formato | Desconocido |
| Realtime | No verificado |
| Frecuencia | — |
| Licencia conocida | — |
| Dependencia | Relación con el municipio; no se mapeó un endpoint actual |
| Riesgo | Confundir marca histórica con el stack Nixel actual |
| Fecha de última verificación | 2026-08-19 |
| Notas | **Hecho:** la nota municipal de 2017 apunta a www.gpsbahia.com.ar. **Hipótesis:** SAPEM ya no opera el feed técnico |

---

## Nixel

| Campo | Valor |
| --- | --- |
| Estado | Proveedor visible en GPSBahía (logo, Play Store `ar.com.nixel.GPSBahia`) |
| Acceso | No hay API documentada para terceros |
| Tipo | Software de movilidad / tracking |
| Formato | El JSON de `app/track_data` es el contrato de hecho del cliente web |
| Realtime | Sí, a través de GPSBahía web |
| Frecuencia | Ver GPSBahía |
| Licencia conocida | Propietario |
| Dependencia | Contrato municipal |
| Riesgo | Cambios de token, WAF, o bloqueo de clientes no-browser |
| Fecha de última verificación | 2026-08-19 |
| Notas | OpenBahía reproduce lo que un navegador público ya hace, con polling por demanda (líneas activas / 10 s, máximo 8, idle 120 s) |

---

## Resumen para implementadores

| ¿Se puede mostrar un colectivo real hoy? | Sí, con `TRANSIT_PROVIDER=gpsbahia` |
| ¿Firebase gpsbus sirve posiciones vivas hoy? | No (hecho: timestamps de julio 2026) |
| ¿Existe el `get_track_data` de 2018? | El path responde, pero `invalidToken` |
| ¿Hay GTFS-RT municipal? | No encontrado |
