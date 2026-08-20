# Case Scope

## meta
- case_id: 20260820-gpsbahia-ui-parity
- created: 2026-08-20T12:25:00.000Z
- operator: local
- primary_skill: js-reverse
- lead_role: lead
- specialist_roles: [browser-automation]

## auth
- status: granted
- basis: own_system
- evidence_of_auth: OpenBahía already consumes GPSBahia public website as realtime source; investigation is to reproduce official rendered bus positions.

## in_scope
- assets: [https://www.gpsbahia.com.ar/]
- surfaces: [web, api, js]
- activities: [recon, reverse, report, implement-provider-parity]

## out_of_scope
- assets: [non-public GPSBahia admin, other cities]
- activities: [DoS, credential theft, commit of cookies/tokens, UI redesign]

## network_profile
- mode: authorized_target_only
- notes: single conservative Playwright session per line; no aggressive polling

## deliverables
- report: true
- field_journal: false
- diagrams: false
- timeline: false

## constraints
- stealth: low
- data_handling: redact cookies/tokens from probe reports

## signoff
- ready_for_act: true
- checklist:
  - [x] auth.status = granted
  - [x] in_scope.assets non-empty
  - [x] network_profile.mode chosen
  - [x] out_of_scope reviewed
