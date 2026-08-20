# GPSBahia UI reverse engineering — official bus marker parity

Last verification: **2026-08-20**.  
Legend: **fact** = observed in a Playwright session against https://www.gpsbahia.com.ar/ or in first-party `app.min.js`; **hypothesis** = not verified.

This document records how the **public GPSBahia web client** obtains and **renders** colectivo markers. OpenBahía parity means:

official Leaflet bus marker ≈ OpenBahía MapLibre bus marker

for the same line, unit, and moment. Transporting `/app/track_data` unchanged is necessary but not sufficient if OpenBahía then hides or lags those rows.

Temporary probe artifacts live in `tmp/gpsbahia-probe/` and are not committed.

---

## LINE 513

### Official vehicle marker count

**Fact:** with Frecuencias OFF and Paradas OFF, Playwright captured **10** Leaflet bus markers (`interno` + icon `frontend/images/markers/micro-*.png`).

### Dropdown / line id

| Field | Value | Status |
| --- | --- | --- |
| Dropdown displayed text | `513` | fact |
| `<option value>` | `12` | fact |
| Position request path | `POST /app/track_data/12.json` | fact |
| Request body | empty (`$.post` with no data) | fact |
| Response rows | 10 objects with `lat`/`lng`/`interno` | fact |

`public 513 → raw 12` is correct **because the official position request uses that same `12`**, not merely because the `<option>` exists.

### Requests made by the official UI (relevant)

After selecting 513 (Frecuencias OFF, Paradas OFF), the browser issued:

1. `POST https://www.gpsbahia.com.ar/web2/get_paradas` — stop/frequency catalog (not bus positions).
2. `POST https://www.gpsbahia.com.ar/app/track_data/12.json?vggaxqq={token}` every **5 s** — bus positions.
3. After turning Frecuencias ON: `GET https://www.gpsbahia.com.ar/web2/get_frecuencias_puntos/12` — clock markers.

Google Maps JS is loaded for “Cómo llego” geocoding, not for bus markers.

### Endpoint responsible for bus markers

**Fact:** `POST /app/track_data/{linea_id}.json?vggaxqq={vgggaxqq}`.

Token names (do not swap them):

- Page script: `var vgggaxqq = '<hex>'` (three `g`s).
- Query parameter name: `vggaxqq` (two `g`s).
- Query parameter value: the `vgggaxqq` page token.

Official client:

`$.post(base_url+"app/track_data/"+localStorage.linea_id+".json?vggaxqq="+vgggaxqq)`

`localStorage.linea_id` is the `<select>` option value (`12` for 513).

### Official position source

**Fact:** `L.marker([a.lat, a.lng], { icon, rotationAngle: a.angle, interno: a.interno })` inside `render_tracks`.

Each official bus marker coordinate matched the nearest `track_data` `lat`/`lng` pair with **delta 0.0 m**.

### Does `/app/track_data` match official rendered coords?

**YES** (fact, line 513, 2026-08-20 session).

### Does the official client transform coordinates?

**NO** for marker placement (fact).

`calculatePathPorcentaje(idaPath|vueltaPath, {lat, lng})` is used only to estimate arrival at stops (`estimateTime`). It does not call `setLatLng` with a snapped point. Leaflet `rotationAngle` rotates the icon only.

Hypothesis (not used as a patch): noisy GPS can sit off the drawn `data-recorridos` polyline; GPSBahia still plots the raw point on top of that polyline, which makes units *look* on-corridor.

### Age filter

**Fact:** GPSBahia draws **every** `track_data` row. In the 513 session, `F 23` had `dt_tracker` ~20 minutes old and was still a bus marker. OpenBahía previously hid units older than 2 minutes from the public snapshot.

---

## LINE 506

### Official vehicle marker count

**Fact:** with Frecuencias OFF and Paradas OFF, Playwright captured **6** Leaflet bus markers.

### Dropdown / line id

| Field | Value | Status |
| --- | --- | --- |
| Dropdown displayed text | `506` | fact |
| `<option value>` | `9` | fact |
| Position request path | `POST /app/track_data/9.json` | fact |
| Request body | empty | fact |
| Response rows | 6 objects with `lat`/`lng`/`interno` | fact |

`public 506 → raw 9` is correct because the official position request uses that `9`.

### Official position source

**Fact:** same `render_tracks` as 513. Each official bus marker matched `track_data` `lat`/`lng` with **delta 0.0 m**.

### Does `/app/track_data` match official rendered coords?

**YES** (fact, line 506, 2026-08-20 session).

### Does the official client transform coordinates?

**NO** for marker placement (fact).

### Frequency control (506)

**Fact:** Frecuencias OFF → 0 clock markers; Frecuencias ON → 28 clock markers. Bus count stays 6.

---

## Frequency vs bus markers

**Fact:**

| Kind | Official icon | Marker options | Frecuencias OFF | Frecuencias ON (513) |
| --- | --- | --- | --- | --- |
| Bus | `frontend/images/markers/micro-{ida\|vuelta}[-H].png` | `interno` | 10 | still present |
| Frequency | `assets/dist/img/clock-marker-{ida\|vuelta}.png` | `frecuencia_id` | 0 | 28 |
| Stop | `assets/dist/img/map-marker.png` | `parada_id` | 0 (checkbox off) | n/a |

Clock icons are **not** colectivos. Compare only with Paradas OFF and Frecuencias OFF.

---

## OpenBahía changes implied by this evidence

1. Keep `POST /app/track_data/{rawId}.json?vggaxqq={vgggaxqq}` — it **is** the official position feed.
2. Public `latitude`/`longitude` remain `track_data.lat`/`lng` with no map-matching snap.
3. Do **not** hide current `track_data` rows by `dt_tracker` age; the official map still draws them.
4. Poll ~every **5 s** (`setInterval(render_tracks, 5e3)`), not 10 s, so the public snapshot does not lag a moving bus by ~80–250 m.

No `GpsBahiaBrowserProvider` is required: the public JSON plus the identity `L.marker([lat, lng])` is enough.

## Simultaneous compare (2026-08-20)

Matching by `interno` only, at the moment official bus markers were captured.

| Line | Official | OpenBahía API | Matched | Median Δ | Max Δ |
| --- | --- | --- | --- | --- | --- |
| 513 | 10 | 10 | 10 | 0.0 m | 0.0 m |
| 506 | 6 | 6 | 6 | 0.0 m | 0.0 m |

Parser vs the same `track_data` body: 0.0 m on every unit (fact). A parallel `GpsBahiaProvider.getVehicles()` can differ by tens of metres on moving units because it is a second POST a moment later, not a coordinate transform.

