# Contribuir

Gracias por ayudar a que el transporte de Bahía Blanca tenga herramientas abiertas.

## Principios

1. El navegador no debe hablar con Firebase, GPSBahía ni Nixel.
2. Toda respuesta externa se valida con Zod.
3. No se inventa GPS ni sentido. Si no hay evidencia, la UI lo dice.
4. Polling conservador: 10 s, solo líneas con clientes, máximo 8, idle 120 s.
5. Sin secretos en git. La config de Firebase pública de gpsbus-web no es un Admin SDK.
6. No redistribuir dumps de terceros. El código es AGPL-3.0; los datos cacheados no.

## Flujo

1. Crear un branch.
2. `pnpm test && pnpm lint && pnpm typecheck`.
3. Documentar hallazgos en `docs/realtime-sources.md` o `docs/static-data-sources.md`, distinguiendo **hecho** e **hipótesis**.

## Licencia

Las contribuciones se aceptan bajo AGPL-3.0.
