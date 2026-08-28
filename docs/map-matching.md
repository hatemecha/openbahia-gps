# Map matching

OpenBahía **conserva el GPS original**. El ajuste a la polilínea es opcional, se marca como derivado y solo se usa para dibujar cuando supera los umbrales de confianza.

## Cuándo no inferir

Si GPSBahía envía `direccion: "ida"|"vuelta"`, se usa como prior pero se comparan ambas geometrías. Esto es necesario porque el feed puede etiquetar todas las unidades como `ida`; una contradicción clara de rumbo y recorrido puede clasificar correctamente una unidad como VUELTA.

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
| Dibujar posición ajustada | `routeMatchState === matched` y confianza ≥ 0.68 y distancia ≤ 45 m |
| Fuera de recorrido | distancia > 180 m → `routeMatchState: off-route` |

El GPS original **siempre** se conserva internamente. Con geometría disponible, los estados `uncertain` y `off-route` no se publican en el mapa cotidiano; reaparecen cuando un fix posterior obtiene un match confiable. Sin geometría, se muestra el GPS reciente y válido para no ocultar toda la línea.

La validación de trayectoria admite 120 m de error base más una velocidad máxima de 45 m/s durante ventanas de hasta 2 minutos. Un salto que excede esa envolvente no entra al matching ni a la presentación.

## Próxima parada

Con recorrido + progreso + paradas de esa geometría, la siguiente parada **adelante** en la polilínea. Solo distancia en metros. Sin ETA.

## Historial

Últimas ~40 observaciones en memoria por vehículo (suavizado, velocidad aproximada, continuidad). No se persisten.
