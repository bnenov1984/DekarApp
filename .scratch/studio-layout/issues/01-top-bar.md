# 01 — Top bar: account inside the bar, Import moved in, grouped order

Status: ready-for-agent
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
