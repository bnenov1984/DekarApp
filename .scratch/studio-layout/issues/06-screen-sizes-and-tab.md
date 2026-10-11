# 06 — Screen sizes and the Tab shortcut

Status: resolved
Type: task
Blocked by: 03, 04, 05
Spec: ../spec.md · decision 8 · 15 §11

## What

- 1024–1279px: right column collapses to an edge strip; clicking it opens the column as an
  overlay over the canvas (canvas doesn't shrink).
- <1024px: view-only per PD-022 — no tool bar, no editing gestures, right column as overlay,
  top bar shows title + Export.
- Tab (when focus isn't in a text field) hides/shows both side columns at any width. Store test
  first for the toggle.

## Acceptance

Store tests for the Tab toggle. Chrome at 1400, 1200 and 900 px wide: layout per §11, no
overlaps, no horizontal page scroll.

## Comments

- 2026-10-11 — Done in `0733199`.
  - Layout state in `panelLayoutSession.ts`: `layoutModeForWidth` (full/compact/view),
    `setViewportWidth`, `viewOnly`, `rightOverlayOpen`, `toggleSidePanels`. View-only guard
    in `studioSession` (executeCommand/undo/redo refuse). 13 new tests, written first.
  - Studio binds the window width; compact and view-only show a "Properties · Layers" strip on the
    right edge that opens the column as an overlay (Escape closes it).
  - View-only also: no tool bar, Undo/Redo/Import hidden, project rename off, calibration banner
    and scale-chip off, context menus off, canvas drags pan and a click selects, Properties fields
    disabled (one fieldset), Layers toggles and drag-reorder disabled, status-bar explanation.
  - Tab toggles only when focus isn't on a field **or a control** — narrower than "not in a text
    field", so tabbing through the panels' own buttons still works.
- **Chrome check:**
  - 1400: canvas 44→1120, docked column; Tab → canvas 0→1400, both columns gone; Tab again →
    restored; Tab from the name field moves focus, doesn't toggle.
  - 1200: tool bar + strip, no docked column; strip opens the overlay and the canvas box doesn't
    change; Escape closes; drawing a rectangle still works.
  - 900: no tool bar, no Undo/Import; R/P/Delete/Ctrl+D/Ctrl+Z/X, a drag over a shape and a
    right-click leave the project unchanged; the drag pans; a click selects; Properties fields and
    Delete disabled. Back to 1400 → full layout and editing return.
  - No horizontal page scroll and no top-bar overlaps at any width. Tests 741 green,
    typecheck/svelte-check/lint clean.
- Deviation from 15 §11 to confirm: the view-only top bar keeps the logo and the account button
  besides title + Export (the owner needs to be able to sign in to view their projects).
- Fixed on the way: the disabled sticky "Delete shape" (ticket 04) was translucent, letting
  content show through it.
