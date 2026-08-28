# Proveniencia de datos

El código de este repositorio es **AGPL-3.0-only**. Eso no convierte en redistribuibles los datos de terceros que el runtime cachea.

| Capa | Origen | Licencia conocida | Notas |
| --- | --- | --- | --- |
| Posiciones en vivo | GPSBahía, cliente web público | No publicada como dato abierto | `POST /app/track_data/{linea}.json` con cookie anónima de la homepage. No republicar dumps. |
| Recorridos (primario) | HTML público GPSBahía `data-recorridos` | Igual | IDs alineados con el GPS. |
| Paradas (primario) | `POST /web2/get_paradas` | Igual | Incluyen nombres de calle cuando el sitio los publica. |
| Recorridos (fallback) | Firebase Storage gpsbus `api/routes/...` | Código cliente Apache-2.0; datos sin licencia abierta declarada | Se consulta `versions.json` antes de bajar un archivo. |
| Recorridos (fallback municipal) | datos.bahia.gob.ar «Recorrido de Colectivos» | Datos abiertos municipales | Atribuir al Municipio de Bahía Blanca. |
| Teselas | OpenFreeMap Liberty / OSM | ODbL para datos OSM | Atribuir OpenStreetMap y OpenFreeMap. |
| Caché local | `data/cache/` | Terceros | Gitignore. No commitear. Escritura atómica. |
| Ubicación del usuario | GPS del teléfono | n/a | Solo al tocar «Mi ubicación». No se envía al servidor. |

Fixtures de test (`providers/*/fixtures`, `test/fixtures`) están sanitizadas: sin cookies, tokens ni cabeceras sensibles.
