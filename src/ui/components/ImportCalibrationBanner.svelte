<script lang="ts">
  // PO follow-up (UX review, item B9 "post-import calibration banner" / item A3 "calibration
  // discoverability") — before this, the only calibration entry point was an 11.5px status-bar
  // chip nobody was finding; every value read as meaningless px² until they did. This is a
  // one-time, dismissable nudge shown right after a fresh image import (appState.ts's
  // showImportCalibrationHint — never on reopening an existing project, calibrated or not, which
  // would make it a nag rather than a nudge). Reuses CalibrationBar.svelte's own visual language
  // (same bar height/floating treatment) but the two never show at once — this hides the instant
  // calibration mode actually starts. Mounted inside Studio.svelte's `.calibration-overlay`,
  // absolutely positioned over the canvas (2026-11-15 — .scratch/calibration-bar-overlay).
  import { activeSurface } from '../stores/studioSession.js';
  import { showImportCalibrationHint, dismissImportCalibrationHint } from '../stores/appState.js';
  import { startCalibration, calibrating } from '../stores/calibrationSession.js';
  import { viewOnly } from '../stores/panelLayoutSession.js';

  $: calibration = $activeSurface?.calibration ?? null;
  $: visible = $showImportCalibrationHint && calibration === null && !$calibrating && !$viewOnly; // calibrating edits the project (PD-022)

  function onCalibrateClick(): void {
    dismissImportCalibrationHint();
    startCalibration();
  }
</script>

{#if visible}
  <div class="import-hint" data-testid="import-calibration-banner">
    <span class="text">Set the scale to get real-world measurements instead of pixels.</span>
    <div class="actions">
      <button type="button" class="calibrate-button" on:click={onCalibrateClick} data-testid="import-hint-calibrate">
        Calibrate
      </button>
      <button
        type="button"
        class="dismiss-button"
        on:click={dismissImportCalibrationHint}
        aria-label="Dismiss"
        title="Dismiss"
        data-testid="import-hint-dismiss"
      >
        ✕
      </button>
    </div>
  </div>
{/if}

<style>
  .import-hint {
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 14px;
    background: color-mix(in srgb, var(--af-warning) 12%, var(--af-surface-panel));
    border: 1px solid var(--af-border-strong);
    border-top: none;
    border-radius: 0 0 var(--af-radius) var(--af-radius);
    box-shadow: var(--af-shadow-float);
  }

  .text {
    font-size: 13px;
    font-weight: 550;
    color: var(--af-ink-primary);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
  }

  .calibrate-button {
    background: var(--af-warning);
    color: var(--af-warning-ink);
    border: none;
    padding: 5px 12px;
    border-radius: var(--af-radius);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .calibrate-button:hover {
    filter: brightness(1.06);
  }

  .dismiss-button {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-radius: var(--af-radius);
    font-size: 12px;
    color: var(--af-ink-tertiary);
    cursor: pointer;
  }

  .dismiss-button:hover {
    background: var(--af-surface-app);
    color: var(--af-ink-primary);
  }

  .calibrate-button:focus-visible,
  .dismiss-button:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: 1px;
  }
</style>
