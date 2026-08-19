# Accessibility

Designed and tested toward **WCAG 2.2 Level AA**. This document does **not** claim WCAG compliance.

Audience: general public in Bahía Blanca, including older adults, low vision, motor difficulties, cheap phones, and bad street connectivity. There is no separate “elderly mode”; the default UI is the accessible one.

## Baseline

- Body 17px, controls 18px, titles 20px+. Line-height ~1.5. No ultralight weights. Secondary text `#3a454c` on cream.
- Frequent actions are at least **44×44 CSS px**: line selector, IDA/VUELTA/TODOS, Mi ubicación, Seguir/Dejar de seguir, Cerrar, Acercar/Alejar.
- Visible `:focus-visible` (3px). Never `outline: none` without a replacement.
- Semantic HTML: `header`, `main`, `nav`/`label`+`select`, `button`, `dialog`, `section`.
- `html lang="es"`. Skip link to content.

## Color is not the only signal

- IDA: solid terracotta line + label “IDA · línea continua”.
- VUELTA: dashed teal line + label “VUELTA · línea punteada”. Bus labels use a dashed vs solid border.
- Status (En vivo, Demorado, Sin conexión) uses text + a dot, not color alone.

## Keyboard

Tab, Shift+Tab, Enter, Space, Escape. Line selector and filters are native controls. The vehicle panel is a modal `<dialog>` (focus trap, restore focus on close). Map markers are duplicated by the textual unit list.

## Screen readers

Status uses a polite `aria-live` region for **connection** changes, not every GPS tick. Focus does not jump on refresh. Markers have an accessible name (`Colectivo 503 IDA unidad …`).

## Motion, zoom, reflow

- `prefers-reduced-motion`: no interpolation, no long pan animation. Follow-bus still recenters (explicit action) with `jumpTo`.
- 200% zoom must keep selector, status, buttons, list, and a usable map. 400% may reflow and scroll.
- ~320 CSS px: no horizontal scroll for controls. Map may keep spatial behavior.
- The map is **not** the only representation: “Ver colectivos de esta línea” lists units as buttons.

## Map alternatives

If MapLibre/WebGL/tiles fail, the shell stays: line selector, status, Retry, textual list. Location is opt-in (“Mi ubicación”), explained, client-side only, never sent to the backend.

## Methodology

- Automated: Playwright + axe-core tags `wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22aa` on home, selected line, and vehicle dialog (`pnpm test:e2e`).
- Manual (release): keyboard-only, 320×568, 390×844, 1366×768, browser zoom 200%, reduced-motion OS setting.
- Automation is insufficient; keyboard and zoom were also walked by hand during hardening.
