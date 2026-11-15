# CalibrationBar / ImportCalibrationBanner: overlay the canvas, don't push it

Status: resolved
Type: spec
Source: Studio UI review with the PO, 2026-11-15 (finding 3.1); fixed same day
Docs: 15_UX_SPECIFICATION.md §2.2, §5 F2, W3 · 16_DESIGN_SYSTEM.md §3.2 CalibrationBar

## Problem

Both bars were flow children of `.shell`, inserted between TopBar and `.main`. Starting
calibration (or importing a fresh image) shifted the tool bar, canvas and right column down by
the bar's own 40px while the user was about to click precisely on the plan — exactly what §2.2's
"nothing moves under the cursor" rule forbids.

## Decision (PO, 2026-11-15)

Both bars float over the canvas instead: absolutely positioned, flush with the canvas's top
edge, spanning only `.canvas-area` (never the tool bar or the right column, both its siblings),
with a shadow and rounded bottom corners instead of the docked bottom border. The two are still
mutually exclusive (ImportCalibrationBanner hides the instant calibration starts) and their own
show/hide logic is unchanged — only where they render in the layout, and how they're styled.

## Ticket

01 overlay — single slice, no store changes needed (visibility logic already lived in
`calibrationSession.ts` / `appState.ts`; this is Studio.svelte markup/CSS plus the two
components' own CSS).
