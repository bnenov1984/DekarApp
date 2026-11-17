<script lang="ts">
  // 15_UX_SPECIFICATION.md §6/W1 — StatusBar: 28px. Sync remains unwired (no cloud sync yet, PD-012
  // stages 2-3). Snap indicator (Tool Dock slice), ScaleChip (Calibration UI slice, 15 §5 F2 step
  // 5: "клик → рекалибриране"), the Unit selector (PO request, expanded unit system) and the zoom %
  // (moved here from the canvas corner, 15 §2.2 Photoshop layout, 2026-10-11; its menu is
  // ZoomMenu.svelte) are live.
  import { snapEnabled, toggleSnap, showEdgeLengths, toggleEdgeLengths, activeTool } from '../stores/drawingSession.js';
  import { openShortcutsOverlay } from '../stores/shortcutsOverlaySession.js';
  import Icon from './Icon.svelte';
  import { activeSurface, selectedMeasurementId, selectedMeasurementIds, backgroundSelected } from '../stores/studioSession.js';
  import { startCalibration, plausibilityWarning, calibrating } from '../stores/calibrationSession.js';
  import { splittingId } from '../stores/splitSession.js';
  import { displayUnit } from '../stores/unitPreferenceSession.js';
  import { convertLengthFromMeters } from '../../core/measurement/unitConversion.js';
  import UnitSelector from './UnitSelector.svelte';
  import ZoomMenu from './ZoomMenu.svelte';
  import { viewOnly } from '../stores/panelLayoutSession.js';
  import type { Unit } from '../../core/domain/types.js';

  // PO request (expanded unit system, §5 "calibration display" must respect the chosen unit) —
  // reuses the same area-unit -> length-unit derivation measurementEngine.ts's own
  // `lengthUnitFor` does (mm2->mm, ft2->ft, etc.); duplicated as a tiny local map rather than
  // exporting that Core-internal helper just for this one display string.
  function lengthUnitLabel(unit: Unit): string {
    if (unit === 'mm2') return 'mm';
    if (unit === 'cm2') return 'cm';
    if (unit === 'in2') return 'in';
    if (unit === 'ft2') return 'ft';
    return 'm';
  }

  function formatScale(metersPerPixel: number, unit: Unit): string {
    const label = lengthUnitLabel(unit);
    const converted = convertLengthFromMeters(metersPerPixel, label as Unit);
    const trimmed = converted.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    return `1 px = ${trimmed} ${label}`;
  }

  $: calibration = $activeSurface?.calibration ?? null;
  // PO follow-up (UX review, item B3 "amber Not-calibrated chip") — every value in the app reads
  // as raw, meaningless px² until this one chip is found and clicked (item A3 of the review); it
  // previously used the exact same muted, tertiary-gray text as every other status chip, making
  // the single most consequential control in the app the easiest one to miss entirely.
  $: isUncalibrated = calibration === null;
  $: scaleLabel =
    calibration === null
      ? 'Not calibrated'
      : calibration.kind === 'linear'
        ? formatScale(calibration.metersPerPixel, $displayUnit)
        : null;
  // geo Surfaces (Map, not reachable yet — no Map surfaces exist) fall through to `null` and the
  // chip simply doesn't render (defensive, not exercised — 15 §5 F2 doesn't apply to born-
  // calibrated Map surfaces in the first place).

  $: warning = $plausibilityWarning;
  $: isImplausible = warning !== null && !warning.plausible;
  $: scaleWarningTooltip = isImplausible
    ? `This scale makes the surface ~${Math.round(warning!.impliedWidthMeters)}m × ${Math.round(warning!.impliedHeightMeters)}m — is that right?`
    : undefined;

  // PO follow-up (UX review, item B7 "contextual hint line") — a whole tier of the app's own
  // gesture vocabulary (double-click to edit points, X to split, Esc to finish a manipulation)
  // previously had zero in-product documentation. One line, priority-ordered by whichever session
  // is actually active; deliberately silent during calibration (CalibrationBar.svelte already
  // owns that instruction) and on a truly empty canvas (CanvasStage's own centered hint owns
  // that first-impression moment instead — this bar would just be a duplicate a few pixels away).
  $: hasAnyMeasurements = ($activeSurface?.layers.flatMap((l) => l.measurements) ?? []).length > 0;
  $: selectedMeasurement = ($activeSurface?.layers.flatMap((l) => l.measurements) ?? []).find(
    (m) => m.id === $selectedMeasurementId,
  );

  const TOOL_HINTS: Partial<Record<string, string>> = {
    pan: 'Drag anywhere to pan the view',
    rectangle: 'Click and drag to draw a rectangle',
    circle: 'Click and drag to draw a circle',
    polygon: 'Click to place points, double-click or Enter to finish',
    freehand: 'Click and drag to trace a shape',
    line: 'Click both ends of the distance to measure',
  };

  $: contextHint = $viewOnly
    ? // PD-022 / 15 §11 — says why nothing can be edited, and how to get editing back.
      'View only on a small screen — widen the window to 1024px or more to edit'
    : $calibrating
    ? null
    : $splittingId
      ? 'Click points across the shape, then Enter to confirm the split'
      : $backgroundSelected
        ? 'Unlock the Background layer (Layers panel) to resize or move it'
        : $selectedMeasurementIds.size > 1
          ? // item A13 "multi-select" — a bulk hint once more than one Measurement is selected;
            // Split only ever applies to exactly one, so it's deliberately absent here.
            `${$selectedMeasurementIds.size} selected • Delete to remove • Ctrl+D to duplicate • Shift-click to adjust`
          : $selectedMeasurementId
            ? // PO follow-up ("unify object selection and edit state") — selection alone already
              // means "drag to move or resize"; double-click is reserved for the per-vertex label
              // workflow now, not a separate "enter edit mode" step.
              `Drag to move or resize • double-click a point to label it • Ctrl+D to duplicate${selectedMeasurement?.shape.type === 'polygon' ? ' • X to split' : ''}`
            : $activeTool !== null
              ? (TOOL_HINTS[$activeTool] ?? null)
              : hasAnyMeasurements
                ? 'Click a shape to select and edit it • Shift-click to select multiple'
                : null;
</script>

<footer class="statusbar">
  {#if scaleLabel}
    <button
      type="button"
      class="scale-chip"
      class:warning={isImplausible}
      class:uncalibrated={isUncalibrated}
      title={isUncalibrated ? 'Measurements are shown in pixels until you set a scale — click to calibrate' : scaleWarningTooltip}
      disabled={$viewOnly}
      on:click={startCalibration}
      data-testid="scale-chip"
    >
      <Icon name="ruler" size={12} /> {scaleLabel}
    </button>
  {/if}
  <button type="button" class="snap-indicator" on:click={toggleSnap} data-testid="snap-indicator">
    <Icon name="magnet" size={12} /> snap {$snapEnabled ? 'on' : 'off'}
  </button>
  <button
    type="button"
    class="snap-indicator"
    on:click={toggleEdgeLengths}
    data-testid="edge-lengths-indicator"
  >
    edges {$showEdgeLengths ? 'on' : 'off'}
  </button>
  <UnitSelector />
  <ZoomMenu />
  {#if contextHint}
    <span class="context-hint" data-testid="context-hint">{contextHint}</span>
  {/if}
  <button
    type="button"
    class="shortcuts-button"
    on:click={openShortcutsOverlay}
    title="Keyboard shortcuts (?)"
    aria-label="Show keyboard shortcuts"
    data-testid="shortcuts-button"
  >
    ?
  </button>
</footer>

<style>
  .statusbar {
    height: 28px;
    flex: 0 0 28px;
    display: flex;
    align-items: center;
    background: var(--af-surface-panel);
    border-top: 1px solid var(--af-border-subtle);
    padding: 0 10px;
  }

  .snap-indicator {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    padding: 2px 6px;
    border-radius: var(--af-radius);
    font-size: 11.5px;
    color: var(--af-ink-secondary);
    cursor: pointer;
  }

  .snap-indicator:hover {
    background: var(--af-surface-app);
    color: var(--af-ink-primary);
  }

  .scale-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    padding: 2px 6px;
    margin-right: 6px;
    border-radius: var(--af-radius);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    color: var(--af-ink-secondary);
    cursor: pointer;
  }

  .scale-chip:disabled {
    cursor: default;
    pointer-events: none;
  }

  .scale-chip:hover {
    background: var(--af-surface-app);
    color: var(--af-ink-primary);
  }

  .scale-chip.warning {
    color: var(--af-warning);
  }

  /* Distinct from .warning (an implausible-but-set scale) — this is "no scale at all yet", the
     single most consequential unclicked control in the app (UX review item A3). A filled amber
     pill, not just tinted text, plus a couple of one-shot pulses to catch the eye on first load —
     deliberately NOT an infinite animation (8h/day users would find that maddening). */
  .scale-chip.uncalibrated {
    color: var(--af-warning-ink);
    background: var(--af-warning);
    font-weight: 600;
    animation: uncalibrated-pulse 1.4s ease-out 2;
  }

  .scale-chip.uncalibrated:hover {
    background: var(--af-warning);
    filter: brightness(1.08);
  }

  @keyframes uncalibrated-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--af-warning) 55%, transparent);
    }
    50% {
      box-shadow: 0 0 0 5px color-mix(in srgb, var(--af-warning) 0%, transparent);
    }
  }

  .context-hint {
    margin-left: 12px;
    font-size: 11.5px;
    color: var(--af-ink-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .shortcuts-button {
    margin-left: auto;
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    background: none;
    border: 1px solid var(--af-border-subtle);
    border-radius: 50%;
    color: var(--af-ink-tertiary);
    cursor: pointer;
  }

  .shortcuts-button:hover {
    color: var(--af-ink-primary);
    border-color: var(--af-ink-secondary);
  }

  .shortcuts-button:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: 1px;
  }
</style>
