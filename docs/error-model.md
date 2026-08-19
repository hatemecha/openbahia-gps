# Error model

Internal states must not be confused: no vehicles ≠ cannot query; old GPS ≠ no GPS; off-route ≠ invalid GPS.

| Internal | Meaning | API | User message | Retry |
| --- | --- | --- | --- | --- |
| `live` | Fresh positions this cycle | `realtimeState: live`, `connectionState: live` | En vivo | No |
| `delayed` | Refresh failed or GPS age is stale; last positions kept | `delayed` | Demorado / Última ubicación hace N min | Automatic |
| `very_stale` | Positions too old to treat as current | `very_stale` | Última ubicación conocida… Puede no estar actualizada | Automatic |
| `no_vehicles` | Upstream answered; this line has no units now | `no_vehicles` | Ahora no hay colectivos de esta línea en el mapa | Automatic |
| `offline` | Browser has no network | frontend | Sin conexión. Las ubicaciones en vivo no pueden actualizarse | When online |
| `upstream_unavailable` | Cannot query GPSBahía (timeout, HTML, circuit open, session failed) | `upstream_unavailable` | No pudimos actualizar las ubicaciones en vivo | Reintentar + backoff |
| `initial_loading` | First fetch in flight | `initial_loading` | Cargando línea N… then Está tardando más de lo habitual… | Wait / Reintentar |
| `demo` | MockProvider | `demo` | Modo demostración | n/a |
| Static `ready` / `cached` / `partial` / `unavailable` | Coherent static dataset | `staticDataState` | Recorrido missing only if `unavailable` | Startup refresh of **same** source |
| Route `matched` | High-confidence snap | `routeMatchState` | Next stop may show | n/a |
| Route `uncertain` | Weak match | `uncertain` | Recorrido no confirmado del todo; **no** next stop | n/a |
| Route `off-route` | GPS far from habitual polyline (e.g. 504 ~242 m) | `off-route` | Recorrido habitual no confirmado; raw GPS; no invented stop | n/a |
| Route `not-available` | No geometry or jump tick | `not-available` | No route claim | n/a |

Persistent problems use the banner, not a toast. Transient follow/location notes stay next to the control.
