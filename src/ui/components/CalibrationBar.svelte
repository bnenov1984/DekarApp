<script lang="ts">
  // docs/15_UX_SPECIFICATION.md §6 W3 — CalibrationBar. Manually started via ScaleChip
  // (StatusBar.svelte) rather than auto-triggered by Import (doesn't exist yet, ISS-008) — see
  // calibrationSession.ts header. Renders only while `$calibrating`; the numeric
  // "[value] [unit▾] ⏎ Set scale" row lives in CanvasStage.svelte instead (anchored to the drawn
  // line's midpoint, closer to W3's actual layout than a fixed bar position would be once a real
  // line exists on a large Surface) — this bar only ever shows the instruction/Cancel/Redraw row.
  // Mounted inside Studio.svelte's `.calibration-overlay`, absolutely positioned over the canvas
  // (2026-11-15 — .scratch/calibration-bar-overlay) — starting calibration used to push the tool
  // bar, canvas and right column down by this bar's own height, which is exactly the "something
  // moves under the cursor while you're about to click precisely" §2.2 forbids.
  import { calibrationDraft, calibrating, cancelCalibration, redrawLine } from '../stores/calibrationSession.js';
</script>

{#if $calibrating}
  <div class="calibration-bar" data-testid="calibration-bar">
    <span class="hint">
      {$calibrationDraft?.to
        ? 'Confirm the real-world length below'
        : $calibrationDraft
          ? 'Click the other end of the reference line'
          : 'Draw a line along a known distance'}
    </span>
    <div class="actions">
      {#if $calibrationDraft}
        <button type="button" class="link" on:click={redrawLine} data-testid="calibration-redraw">Redraw</button>
      {/if}
      <button type="button" class="link" on:click={cancelCalibration} data-testid="calibration-cancel">Cancel</button>
    </div>
  </div>
{/if}

<style>
  .calibration-bar {
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 14px;
    background: var(--af-surface-panel);
    border: 1px solid var(--af-border-strong);
    border-top: none;
    border-radius: 0 0 var(--af-radius) var(--af-radius);
    box-shadow: var(--af-shadow-float);
  }

  .hint {
    font-size: 13px;
    font-weight: 550;
    color: var(--af-ink-primary);
  }

  .actions {
    display: flex;
    gap: 8px;
    flex: 0 0 auto;
  }

  .link {
    background: none;
    border: none;
    padding: 4px 8px;
    border-radius: var(--af-radius);
    font-size: 12.5px;
    font-weight: 600;
    color: var(--af-accent);
    cursor: pointer;
  }

  .link:hover {
    background: var(--af-surface-app);
  }
</style>
