# 02 — Zoom menu, typed %, + - 0

Status: resolved
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

## Comments

- 2026-10-12 — Done in `faf6f3a`. viewport.ts: `parseZoomPercent`, `zoomTo`, `zoomByStep`;
  viewportSession: `centerZoomRequested` + `requestZoomTo` / `requestZoomStep` /
  `requestZoomReset`, applied by CanvasStage via `zoomAtCenter` (it consumes the request, so a
  later-mounted canvas doesn't replay it); replaces `zoomResetRequested`. `ZoomMenu.svelte` holds
  the % button and the menu. Studio `handleZoomKey`; the shortcuts overlay lists `+ −`, `0` and the
  menu. 11 new tests, written first.
- Choices inside the spec: Zoom in/out keep the menu open (so they can be clicked repeatedly);
  the other items close it. Junk + Enter keeps the menu open with the current value selected.
  Blurring the field without Enter discards the typed text. A decimal comma ("12,5") is accepted.
- **Chrome check** (1400 and 900px): typed 150 → 150%, "250%" → 250%, 5 → 10%, "abc" → stays,
  field restored; presets 50/200/100; Zoom in ×2 → 121% with the field following; Escape and an
  outside click close; `+` `=` `-` `0` Shift+1 work, also in view-only; typing "-0+" in the field
  doesn't zoom. Menu opens above the %, inside the window, no overlap, no horizontal scroll.
  Tests 758 green, typecheck/svelte-check/lint clean.
- Seen once in ~12 full runs, unrelated to zoom: the PD-024 fast-check property test in
  `roundtrip.test.ts` ("after a linked drag of a split boundary point, the parts still tile the
  moved outline") failed, then passed on rerun — a rare random counterexample, not captured.
