<script lang="ts">
  // PO request (dynamic calibrated scale bar, §4) — self-contained canvas overlay, same pattern
  // as StatusBar's ScaleChip for reading calibration, but this reads viewport zoom too (its whole
  // reason for existing: "the same visual target width may represent a different real-world
  // distance after zooming"). Renders nothing without a valid linear Calibration (§4 "visible
  // only when the project has valid calibration" — geo/Map Surfaces aren't reachable yet, same
  // precedent as StatusBar's own scaleLabel gating).
  import { activeSurface } from '../stores/studioSession.js';
  import { viewport } from '../stores/viewportSession.js';
  import { unitSystem } from '../stores/unitPreferenceSession.js';
  import { chooseScaleBar } from '../rendering/scaleBar.js';

  $: calibration = $activeSurface?.calibration ?? null;
  // metersPerScreenPixel: how many real-world meters one CSS pixel currently represents — the
  // Calibration's own metersPerPixel (world/Surface units) divided by the viewport's zoom scale
  // (screen px per world px, viewport.ts) collapses to exactly this one ratio.
  $: metersPerScreenPixel = calibration?.kind === 'linear' ? calibration.metersPerPixel / $viewport.scale : null;
  $: result = metersPerScreenPixel !== null ? chooseScaleBar(metersPerScreenPixel, $unitSystem) : null;
</script>

{#if result}
  <div
    class="scale-bar"
    role="img"
    aria-label="Scale bar represents {result.label}"
    data-testid="scale-bar"
  >
    <div class="bar" style="width: {result.widthPx}px"></div>
    <span class="label">{result.label}</span>
  </div>
{/if}

<style>
  .scale-bar {
    position: absolute;
    left: 12px;
    bottom: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    pointer-events: none;
  }

  .bar {
    height: 4px;
    border: 1px solid var(--af-ink-secondary);
    border-top: none;
    background: color-mix(in srgb, var(--af-ink-secondary) 20%, transparent);
  }

  .label {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--af-ink-secondary);
    text-shadow:
      0 0 3px var(--af-surface-app),
      0 0 3px var(--af-surface-app);
  }
</style>
