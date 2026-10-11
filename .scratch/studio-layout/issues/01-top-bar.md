# 01 — Top bar: account inside the bar, Import moved in, grouped order

Status: resolved
Type: task
Blocked by: —
Spec: ../spec.md · decision 2 · 15 §2.2 · 16 §3.1 TopBar

## What

- `AccountMenu.svelte` stops being `position: fixed` and is mounted inside `TopBar.svelte` as its
  last item (remove it from `App.svelte`). Its dropdown stays anchored under its trigger.
  Home.svelte loses it — Home is unreachable from the default flow (appState.ts).
- Import (file input, MIME errors, disabled while calibrating/splitting) moves out of
  `ToolDock.svelte` into the top bar, before Export. The error message shows under the button.
- Order: logo · project name · Undo/Redo · spacer · Import · Export · account.

## Acceptance

In Chrome at 1400×900 (empty project, and with one shape): no two top-bar controls overlap
(bounding boxes); Undo and Redo are visible and clickable; Import opens the file picker and an
unsupported file shows the error; Export still downloads CSV; Sign in opens its menu inside the
viewport. The tool dock no longer has an Import slot. Typecheck, svelte-check, lint, tests green.

## Comments

**2026-10-11 — resolved.** Implemented in `4000d89`.

- Import is its own component, `ImportButton.svelte`; the error shows as a small popover under it.
- The account trigger now uses the same outline style as Import/Export.
- Hands-on check (Chrome 1400×900, real mouse): bar order project name → Undo → Redo → Import →
  Export → account, no overlapping boxes, empty and with a shape; Undo/Redo buttons undo and redo
  a drawn polygon; Export downloads `Untitled.csv`; Import with a text file shows "Unsupported
  file…"; the Sign in panel opens inside the viewport; no Import slot left in the dock.
- The page logs `TypeError: Failed to fetch` on load with or without this change: the auth client
  calls `localhost:8787/api/auth/get-session` and no auth server runs locally. Not touched here.
