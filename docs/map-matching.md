# Map matching

OpenBahía **conserva y dibuja el GPS original**. El punto sobre la polilínea es derivado y queda disponible para progreso, próxima parada y debug, pero no desplaza el marker.

## Cuándo no inferir

Si GPSBahía envía `direccion: "ida"|"vuelta"`, se usa como prior, pero se comparan ambas geometrías. Una contradicción clara de rumbo y recorrido puede clasificar correctamente una unidad como VUELTA cuando el feed etiqueta una unidad de forma errónea.

Si no hay sentido, se compara el vehículo con los recorridos de **esa línea**.

## Señales

```
confidence = 0.5 * distanceScore + 0.3 * headingScore + 0.2 * continuityScore
```

- `distanceScore`: 1 si está sobre la línea, 0 a 180 m.
- `headingScore`: diferencia angular circular entre el `angle` del vehículo y el rumbo del segmento (0° vs 359° = 1°). Vehículo parado (~<1.2 m/s): peso neutro 0.5.
- `continuityScore`: favorece el recorrido anterior del mismo interno.

## Histéresis

No se voltea IDA↔VUELTA por ruido GPS. Si el candidato nuevo apenas mejora al anterior (`< 0.12` de confianza) y el previo sigue cerca (`≤ 18 m` extra), se mantiene el previo y se re-snapéa a esa polilínea.

## Umbrales

| Uso | Condición |
| --- | --- |
| Mostrar sentido IDA/VUELTA | provider, o confianza ≥ 0.58 y distancia ≤ 80 m |
| Flecha del marker | mismo criterio; el rumbo publicado se alinea al segmento emparejado |
| Fuera de recorrido | distancia > 180 m → `routeMatchState: off-route` |

El GPS original **siempre** se conserva y se publica. Con geometría disponible, `uncertain` y `off-route` impiden inferir progreso o próxima parada, pero no esconden una unidad con fix reciente, válido y físicamente plausible.

La validación de trayectoria admite 120 m de error base más una velocidad máxima de 45 m/s durante ventanas de hasta 2 minutos. Un salto que excede esa envolvente no entra al matching ni a la presentación.

## Próxima parada

Con recorrido + progreso + paradas de esa geometría, la siguiente parada **adelante** en la polilínea. Solo distancia en metros. Sin ETA.

## Historial

Últimas ~40 observaciones en memoria por vehículo (suavizado, velocidad aproximada, continuidad). No se persisten.
