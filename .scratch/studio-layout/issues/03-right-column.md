# 03 — Right column: Properties over Layers, always visible

Status: resolved
Type: task
Blocked by: 02
Spec: ../spec.md · decision 4 · 15 §2.2, W1, W2 · 16 §3.2 PanelShell

## What

- `MeasurementList` moves from the left into the right column under `PropertyPanel`; one
  280px column with a draggable divider between the two sections.
- Both sections always render: "Select a shape to see its properties." / "No shapes yet."
  The canvas no longer jumps when the first shape is drawn.
- Σ Total area stays at the bottom of the Layers section. Section headers share one style.

## Acceptance

Chrome: canvas bounding box identical before and after drawing the first shape; both sections
visible on an empty project; divider drag resizes them (position remembered for the session).

## Comments

**2026-10-11 — resolved.** Implemented in `bbc2e6a`.

- `RightColumn.svelte` holds `PropertyPanel` on top and `MeasurementList` below and owns the
  280px width. Neither panel sets its own width or border any more.
- **Divider:** the share Properties takes is stored in a new `panelLayoutSession.ts`, written
  test-first (9 tests, red then green). It defaults to 50%, is clamped to 20–80% so neither
  section can be dragged shut, and is kept for the session only, not persisted.
- **Ways to move it:** drag it, use ↑/↓ while it's focused, or double-click to reset. Arrow keys
  on the divider don't reach Studio's shape nudging. It is an ARIA window splitter (`role=separator`
  with aria-valuenow); Svelte's a11y check flags any focusable separator, so that warning is
  silenced with the reason in a comment.
- The Properties empty state now has the same "Properties" header as the selected state; the
  text reads "Select a shape to see its properties."
- **Hands-on check** (Chrome 1400×900, real mouse):
  - The canvas is 44→1120 on an empty project and keeps exactly the same box after the first
    shape and after selecting it. The column is 1120→1400.
  - The empty texts show in both sections.
  - The default split was 412/411 px. Dragging up 200px gave 212/611; dragging past the bottom
    clamped at 80%; ↑ gave 75%; double-click went back to 50%.
  - ↑ on the divider did not move the selected shape, and Σ Total area shows under Layers.
