# Contribuir

Gracias por ayudar a que el transporte de Bahía Blanca tenga herramientas abiertas.

## Principios

1. El navegador no debe hablar con Firebase, GPSBahía ni Nixel.
2. Toda respuesta externa se valida con Zod.
3. No se inventa GPS. El sentido informado por la fuente es un prior y solo se corrige cuando rumbo, geometría y continuidad aportan evidencia suficiente.
4. Polling conservador: 5 s, solo líneas con clientes, máximo 8, idle 120 s.
5. Sin secretos en git. La config de Firebase pública de gpsbus-web no es un Admin SDK.
6. No redistribuir dumps de terceros. El código es AGPL-3.0-only; los datos cacheados no.

## Flujo

1. Crear un branch.
2. Ejecutar `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build`.
3. Documentar hallazgos en `docs/realtime-sources.md` o `docs/static-data-sources.md`, distinguiendo **hecho** e **hipótesis**.

Issues y pull requests son bienvenidos. El proyecto es mantenido de forma personal: aceptar una propuesta, definir alcance y publicar versiones sigue siendo decisión del mantenedor.

## Licencia

Las contribuciones se aceptan bajo AGPL-3.0-only.
