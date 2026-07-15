<script lang="ts">
  // 15_UX_SPECIFICATION.md §6/W1 — StatusBar: 28px. Units/zoom/sync remain unwired (no
  // unit-switching UI / persistence yet). Snap indicator (Tool Dock slice) and ScaleChip
  // (Calibration UI slice, 15 §5 F2 step 5: "клик → рекалибриране") are both live.
  import { snapEnabled, toggleSnap } from '../stores/drawingSession.js';
  import { activeSurface } from '../stores/studioSession.js';
  import { startCalibration, plausibilityWarning } from '../stores/calibrationSession.js';

  function formatScale(metersPerPixel: number): string {
    const trimmed = metersPerPixel.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    return `1 px = ${trimmed} m`;
  }

  $: calibration = $activeSurface?.calibration ?? null;
  $: scaleLabel =
    calibration === null ? 'Not calibrated' : calibration.kind === 'linear' ? formatScale(calibration.metersPerPixel) : null;
  // geo Surfaces (Map, not reachable yet — no Map surfaces exist) fall through to `null` and the
  // chip simply doesn't render (defensive, not exercised — 15 §5 F2 doesn't apply to born-
  // calibrated Map surfaces in the first place).

  $: warning = $plausibilityWarning;
  $: isImplausible = warning !== null && !warning.plausible;
  $: scaleWarningTooltip = isImplausible
    ? `This scale makes the surface ~${Math.round(warning!.impliedWidthMeters)}m × ${Math.round(warning!.impliedHeightMeters)}m — is that right?`
    : undefined;
</script>

<footer class="statusbar">
  {#if scaleLabel}
    <button
      type="button"
      class="scale-chip"
      class:warning={isImplausible}
      title={scaleWarningTooltip}
      on:click={startCalibration}
      data-testid="scale-chip"
    >
      ⚖ {scaleLabel}
    </button>
  {/if}
  <button type="button" class="snap-indicator" on:click={toggleSnap} data-testid="snap-indicator">
    ⌗ snap {$snapEnabled ? 'on' : 'off'}
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
    background: none;
    border: none;
    padding: 2px 6px;
    border-radius: var(--af-radius-sm);
    font-size: 11.5px;
    color: var(--af-ink-secondary);
    cursor: pointer;
  }

  .snap-indicator:hover {
    background: var(--af-surface-app);
    color: var(--af-ink-primary);
  }

  .scale-chip {
    background: none;
    border: none;
    padding: 2px 6px;
    margin-right: 6px;
    border-radius: var(--af-radius-sm);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    color: var(--af-ink-secondary);
    cursor: pointer;
  }

  .scale-chip:hover {
    background: var(--af-surface-app);
    color: var(--af-ink-primary);
  }

  .scale-chip.warning {
    color: var(--af-warning);
  }
</style>
