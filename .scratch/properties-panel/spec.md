# Properties panel — height follows content, Split opens a popover

Status: resolved
Type: spec
Source: Studio UI review with the PO, 2026-11-15 (findings 1.1–1.3)
Docs: 15_UX_SPECIFICATION §2.2 · 16_DESIGN_SYSTEM §3.2 PanelShell, PropertyPanel · studio-layout spec decisions 4 and 6

## Problem

The divider gives Properties a fixed 50% of the right column. A selected polygon already needs
more than that at a 900px window, so the panel scrolls before anything is opened. The Split
form adds ~180px inside the panel: "Distribution" and the confirm button fall below the fold and
the sticky "Delete shape" floats over the half-visible form.

## Decisions (PO, 2026-11-15)

1. **Properties takes the height of its content.** Default is automatic: at least 160px, at
   most 65% of the column; Layers takes the rest. Nothing scrolls on a normal selection.
2. **The divider stays as a manual override.** Dragging it (or ↑/↓ on it) switches to a fixed
   share, exactly as today; double-click returns to automatic. Session-only, as before.
3. **The Split form opens as a popover** anchored to the Split button, to the left of the panel,
   over the canvas: title, parts, distribution, confirm, manual-split link — same content as
   today. Escape, a click outside, confirming, or changing the selection closes it. The form no
   longer takes any height inside the panel.
4. **"Delete shape" is no longer pinned.** It stays last, full width, low emphasis (decision 6
   of the studio-layout spec), in the flow of the panel.
5. Out of scope here (separate review items): the duplicate count field, the "Random" label,
   the outer Split button's emphasis, the "Area (m²)" label.

## Tickets

01 auto height (store first) → 02 Split popover and Delete in flow.
Each: tests green, Chrome check with bounding boxes, separate commit; docs in a `docs:` commit.

## Comments

**2026-11-15 — resolved.** Both tickets done; 15 §2.2 and 16 §3.2 amended in the same docs commit.
