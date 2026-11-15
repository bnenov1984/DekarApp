# Studio layout — Photoshop model

Status: ready-for-agent
Type: spec
Source: grilling session with the PO, 2026-10-11
Docs: 15_UX_SPECIFICATION §2.2, W1, W2, §11, D1 · 16_DESIGN_SYSTEM §3.1–3.2

## Problem

The Studio has no coherent layout logic. Tools float bottom-centre, Layers sit on the left,
Properties on the right, and the account button is `position: fixed` over the top bar's right
corner, where it covers Undo/Redo and collides with Export.

## Decisions (PO, 2026-10-11)

1. **Layout model: Photoshop.** Vertical tool bar on the left edge; all panels on the right;
   canvas in between. Supersedes 15 D1 (the bottom dock's reason — survives phone/touch — went
   away with PD-022). No new PD: PD-014 forbids per-workspace layouts, not a change of the one
   layout. UX spec edited in place with PO approval.
2. **Top bar**, grouped by kind, left to right: logo · project name ✎ · Undo/Redo …… Import ·
   Export · account. Every item is a flex child of the bar; nothing is positioned over it.
3. **Scope:** layout + consistency pass (panel headers, action placement, spacing). No visual
   restyle (colours/type/icons stay per 16).
4. **Right column** (fixed 280px): Properties on top, Layers below, draggable divider. Always
   visible, also on an empty project ("Select a shape…" / "No shapes yet."). Σ Total area stays at
   the bottom of Layers.
5. **Tool bar** (~44px, icons only, full height): Pan · Rectangle · Polygon · Circle · Freehand ·
   Distance │ Split (X). Split is disabled without a selection (slots never appear/disappear).
   Tooltip = name + shortcut. Import moves to the top bar.
6. **Properties:** header shows only the title. Lock lives only on the Layers rows. Split is a
   normal button in the body. "Delete shape" is a full-width low-emphasis button at the bottom;
   Backspace and the context menu still delete.
7. **Zoom %** moves from the canvas corner into the status bar.
8. **Screen sizes:** ≥1280 full layout; 1024–1279 right column collapses to an edge strip that
   opens as an overlay; <1024 view-only (PD-022: no tool bar, no editing). **Tab** hides/shows
   both side columns at any width.

## Tickets

01 top bar → 02 tool bar → 03 right column → 04 properties cleanup → 05 zoom → 06 screen sizes.
Each: browser check with screenshots, separate commit; push only on the PO's word.

## Testing note

The UI has no component-test harness (vitest covers `src/**/*.test.ts`, stores only). Pure
layout changes are verified in Chrome via a playwright-core driver: screenshots plus
bounding-box assertions (no overlaps, expected order). Logic that moves into a store (e.g. the
Tab toggle, the panel divider position) gets store tests first.

## Comments

**2026-11-15.** Decisions 4 and 6 refined by `.scratch/properties-panel/spec.md`: Properties takes the height of its content (the divider is an override), the Split form opens as a popover, and Delete is no longer pinned.
