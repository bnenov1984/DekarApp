# 02 — Left vertical tool bar

Status: resolved
Type: task
Blocked by: 01
Spec: ../spec.md · decision 5 · 15 W1 · 16 §3.1 ToolBar

## What

- `ToolDock.svelte` becomes a vertical bar docked to the left edge of the main row (~44px, full
  height between top bar and status bar), not floating over the canvas.
- Slots: Pan · Rectangle · Polygon · Circle · Freehand · Distance │ Split (X). Split starts the
  same flow as the X key / Properties Split; disabled without a selection or on a locked shape.
- Arrow keys ↑/↓ move focus; `aria-orientation="vertical"`. Tooltip = name + shortcut.

## Acceptance

Store test for the Split slot's enabled state if it needs new logic. Chrome: bar on the left,
canvas starts to its right, drawing with every tool still works, Split slot disabled with no
selection and starts a split with one.

## Comments

**2026-10-11 — resolved.** Implemented in `7aa8226`.

- **Which Split:** the bar's Split slot runs the manual line split, the same as the X key, since
  it is a canvas action. The Split button in Properties keeps opening the parts config
  (Equal/Random).
- **Store logic, test-first:** `canStartSplit` and `toggleSplitTool` in `splitSession.ts`, with 5
  new tests (red, then green). Starting a split leaves an armed drawing tool; a second click
  cancels.
- New `split` icon in `Icon.svelte`. The empty-canvas hint now says "choose a tool on the left".
- **Hands-on check** (Chrome 1400×900, real mouse): the bar is at x 0–44 and full height, and the
  canvas starts at x 44. Slots run top to bottom: Pan, Rectangle, Polygon, Circle, Freehand,
  Distance, divider, Split. Each tool, picked from its slot, drew a shape (5 shapes). Split is
  disabled on an empty project and with a rectangle selected. With the polygon selected it is
  enabled; clicking it showed the live two-area preview, Enter made the two parts, and Ctrl+Z
  undid them. ↓/↑ move focus between slots.
- The Layers panel still sits between the bar and the canvas until ticket 03.
