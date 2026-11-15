# 02 — Split form as a popover; Delete in flow

Status: resolved
Type: task
Blocked by: 01
Spec: ../spec.md · decisions 3–4

## What

- New `SplitPopover.svelte`: the existing parts/distribution/confirm/manual-split form, rendered
  `position: fixed` to the left of the Split button (the panel scrolls, so it can't be a
  positioned child of it). Closes on Escape (stopPropagation, like ZoomMenu), click outside,
  confirm, selection change. Focus goes to the first control on open.
- `PropertyPanel.svelte`: the Split button opens the popover; the inline form and its CSS move
  out. "Delete shape" loses `position: sticky` and its masking shadow.

## Acceptance

Chrome 1440×900: Split opens the popover beside the button, fully visible, panel height
unchanged; Escape and outside click close it; confirm splits and closes; Delete sits last in
the flow with no overlap.

## Comments

**2026-11-15 — resolved.** New `SplitPopover.svelte` holds the parts/distribution/confirm/manual
form, `position: fixed`, placed left of the Split button from its rect (re-placed on resize and
any scroll). PropertyPanel keeps only the button (now `bind:this`) and the mount; the form's CSS
moved with it. "Delete shape" lost `position: sticky` and the masking shadow.

Chrome 1440×900: Split button at x 1173–1428, y 299–328; popover 248×239 at x 917–1165,
y 299–538, fully inside the viewport, 8px gap to the button, focus on the "2" preset; Properties
stayed 442px with no scroll. Escape closed it and kept the selection; "Split polygon" produced
"Area 1 — Part 1/2" rows (3 rows) and closed it; reopened on a part, a click on the empty canvas
closed it. Console shows only the pre-existing auth fetch error (backend not running).
