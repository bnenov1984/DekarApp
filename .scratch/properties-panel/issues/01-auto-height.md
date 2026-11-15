# 01 — Properties section: automatic height, divider as override

Status: resolved
Type: task
Spec: ../spec.md · decisions 1–2

## What

- `panelLayoutSession.ts`: `propertiesShare` becomes `number | null`; `null` means automatic.
  `setPropertiesShare` switches to an override, `resetPropertiesShare` returns to automatic,
  `nudgePropertiesShare` starts from the measured share when automatic. Constants
  `MIN_PROPERTIES_PX = 160`, `AUTO_MAX_PROPERTIES_SHARE = 0.65`.
- `RightColumn.svelte`: automatic → `flex: 0 1 auto; min-height: 160px; max-height: 65%`;
  override → `flex-basis: share%`. The divider reports the measured share to ARIA.

## Acceptance

Store tests green. Chrome 1440×900: selecting a polygon shows no scrollbar in Properties;
Layers fills the rest; dragging the divider still works; double-click returns to automatic.

## Comments

**2026-11-15 — resolved.** Store first: `propertiesShare` is `number | null` (`null` = automatic),
tests rewritten red → green (22 in `panelLayoutSession.test.ts`). `RightColumn.svelte` applies
`flex: 0 1 auto; min-height: 160px; max-height: 65%` in automatic mode and the inline
`flex-basis` share as an override; the divider's ARIA value and a keyboard nudge from automatic
start from the measured share (read on focus/hover/keydown, refreshed by a ResizeObserver).

Chrome 1440×900, measured with bounding boxes: column 824px tall; a selected 4-vertex polygon
gives Properties 442px (= its content, `scrollHeight == clientHeight`, no scrollbar), Layers
381px; "Delete shape" is `position: static` at 449–480, above the Layers section at 491. ↓ on the
focused divider went 54% → 59% (inline basis 58.6%, 483px); double-click returned to automatic
(442px). Lint, tsc, svelte-check clean; 770 tests green.
