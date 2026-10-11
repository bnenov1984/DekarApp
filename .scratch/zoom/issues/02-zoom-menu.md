# 02 — Zoom menu, typed %, + - 0

Status: ready-for-agent
Type: task
Blocked by: 01
Spec: ../spec.md · decisions 3, 4, 5

## What

- Pure helpers, tested first: parse a typed % ("150", "150%", " 75 ", out of range → clamped,
  junk → null); zoom to a scale around an anchor; step in/out around an anchor.
- viewportSession requests the canvas reacts to (center anchor), like the reset/fit signals.
- `ZoomMenu.svelte` from the status-bar %, per 16 ZoomMenu; double-click removed.
- Studio: `+`/`=`, `-`, `0`; Shift+1 stays; allowed in view-only, not while typing.

## Acceptance

Chrome: typing 150 → 150%; presets; + - 0; Escape and outside click close the menu; no overlap at
1400 and 900px.
