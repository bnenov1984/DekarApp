# Zoom — wheel step, zoom over labels, zoom menu

Status: ready-for-agent
Type: spec
Source: grilling session with the PO, 2026-10-11
Docs: 15_UX_SPECIFICATION §2.2 (Zoom), §13 · 16_DESIGN_SYSTEM ZoomMenu (commit b94c9f9)

## Problem

1. One mouse-wheel notch zooms 100 → ~180% on Windows. The factor is 1.0015^deltaY, and many
   Windows mice report deltaY 300–400 per notch.
2. The wheel doesn't zoom over a shape's label (or any HTML drawn over the canvas): the listener
   is on the `<canvas>` element only.
3. There is no way to type a zoom %, and `+` `-` `0` from 15 §13 aren't implemented.

## Decisions (PO, 2026-10-11)

1. One wheel notch = a fixed ×1.1 step regardless of reported deltaY. Large deltas (≥50px, or
   line/page mode) are a notch; small deltas (trackpad, pinch) stay proportional, never more than
   one step per event.
2. The wheel zooms anywhere over the canvas area, labels and overlays included.
3. Clicking the status-bar % opens a ZoomMenu: % input (Enter applies), Zoom to fit, 50%, 100%,
   200%, Zoom in, Zoom out, with shortcuts. Double-click on the % goes away.
4. Typed %: anchored at the canvas center, clamped to 10–800%, "150%" accepted, junk restores the
   current value silently.
5. `+`/`=` and `-` zoom ×1.1 around the center, `0` fits, Shift+1 stays. Allowed in view-only.
6. Living-spec edit, no PD.

## Tickets

- 01 — Wheel step and zoom over labels
- 02 — Zoom menu, typed %, `+ - 0` (blocked by 01)
