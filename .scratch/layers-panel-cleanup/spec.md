# Layers panel: count as a pill, drag handle as a real icon

Status: resolved
Type: spec
Source: Studio UI review with the PO, 2026-11-15 (findings 2.1, 2.2); fixed 2026-11-16
Docs: 16_DESIGN_SYSTEM.md §3.2 MeasurementList, §4 icon set

## Problem

1. The row count rendered as a bare superscript character straight after "Layers" —
   `Layers¹` — and read as a footnote, not a count.
2. The row drag handle was the Unicode glyph U+28FF (⠿), which falls back to whatever font the
   OS happens to pick and doesn't match the 1.75px stroke icon set (16 §4).

## Decision (PO, 2026-11-15/16)

1. The count renders as a small rounded pill in secondary ink next to the title, the
   conventional treatment for a count beside a section header — not a new named component,
   just the existing `.count` span restyled.
2. The drag handle becomes a real icon (`grip`, added to the shared `Icon` component): six
   filled dots, the standard reorder-grip glyph. Shown only on row hover (or while dragging) —
   the row itself is draggable everywhere, not just from this affordance, so the icon is a
   hint, not a hit target.

## Ticket

01 — single slice, no store changes; `Icon.svelte` + `MeasurementList.svelte` only.
