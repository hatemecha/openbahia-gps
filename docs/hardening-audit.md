# Hardening audit — 2026-08-19

Skills used: `a11y-maxxing`, `accessibility` (addyosmani/web-quality-skills, 45.5K installs), `playwright-best-practices` (currents-dev, 73.3K), `frontend-design`, `web-design-guidelines`, `sveltekit-structure`, `fastify-best-practices`. Skill Ninja GitHub search returned 401; `npx skills find` was used instead.

Verified before this pass: GPSBahía live 503/504, static routes/stops, 50 unit tests, lint/typecheck/build OK.

## CRITICAL

| ID | Finding | Evidence |
| --- | --- | --- |
| C1 | Off-route GPS still gets `nextStop` from the snapped polyline | Hub `enrich()` always calls `nextStopAlongRoute` when a match object exists. Live 504 sample at **242 m** still had `nextStop`. Violates “no next-stop from doubtful route”. |
| C2 | Matched coordinates are always stored and can leak into UI if `positionKind` is misread | `matchedLatitude` set even at 242 m. Presentation must ignore them unless matched + high confidence. |
| C3 | Invalid env is swallowed | `REALTIME_REFRESH_MS=-10` falls back to 10 s instead of failing startup. |

## HIGH

| ID | Finding | Evidence |
| --- | --- | --- |
| H1 | IDA/VUELTA distinguished mainly by color | Solid terracotta vs teal; no dash/pattern/text on the map line itself. |
| H2 | Touch targets < 44px | Header select, filter chips, close, map controls. |
| H3 | Secondary text contrast / size | `--muted: #5b6a73` on cream, body ~14–15px in places. |
| H4 | Map is a single point of failure | No textual vehicle list; map error kills the only view of buses. |
| H5 | SSE `onerror` polls every 5 s with no backoff; can duplicate work | `+page.svelte` SSE fallback. |
| H6 | Static cache writes are not atomic | `writeFile` in place; crash can truncate JSON. |
| H7 | Source can flap at startup | `StaticStore.load` tries GPSBahía then gpsbus even if a valid GPSBahía cache exists. |
| H8 | No circuit breaker | After upstream death, hub still retries (backoff yes, but no OPEN/HALF_OPEN). |
| H9 | Session has single-flight but no BACKOFF/FAILED state | Expired session storms possible after persistent homepage failure. |
| H10 | No GPS bbox/null-island/jump validation beyond Zod lat/lon | 0,0 and km-jumps can enter matching/interpolation. |
| H11 | Public copy still technical in places | `public endpoint unavailable` in API reasons; some UI paths expose it. |
| H12 | No keyboard/dialog contract on the vehicle sheet | `aside`, not `dialog`; no focus trap/restore. |
| H13 | No `lineId` allowlist | Garbage query params accepted. |
| H14 | No security headers / rate limit on public API | CORS only. |
| H15 | Last line not remembered | Users re-pick 503 every visit. |
| H16 | Geolocation not present (good: not requested on load) | Need opt-in “Mi ubicación” with explanation, client-only. |

## MEDIUM

| ID | Finding |
| --- | --- |
| M1 | `html lang="es"` already set — keep. |
| M2 | No `prefers-reduced-motion` on interpolation. |
| M3 | `aria-live` would spam if we announce every GPS tick — must be careful. |
| M4 | Health OK (cached); no `/api/ready`. |
| M5 | No graceful SIGTERM beyond Fastify `onClose`. |
| M6 | Clock skew: age clamped at 0 but copy is “hace 0 s”. |
| M7 | Stop markers are unlabeled on the map for SR. |
| M8 | Overlay + sheet z-index can collide on 320px. |

## LOW

| ID | Finding |
| --- | --- |
| L1 | No Playwright/axe yet. |
| L2 | Debug pill still easy to leave in if `?debug=1`. Isolated otherwise. |
| L3 | Bundle includes full MapLibre (~1 MB) — expected; map must remain optional. |

## Fix order

C3–H16 from the first pass were addressed in this hardening iteration (config fail-fast, off-route nextStop, circuit breaker, atomic cache, a11y UI, Playwright/axe). Re-run `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build` after changes.
