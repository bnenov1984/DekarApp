<script lang="ts">
  // 16_DESIGN_SYSTEM.md §3.1 MeasurementChip — "живият етикет върху фигурата: име + основна
  // стойност". Rendered as a positioned DOM element (not drawn on the canvas): text layout,
  // rounded background, and reliable readability over an arbitrary-colored fill are exactly what
  // Canvas2D is clumsy at and DOM/CSS is good at — the canvas owns geometry pixels, chips are UI
  // chrome anchored to it (21 §6.3 "successor projection" reasoning, same split as the
  // Measurement List a11y path, D8).
  export let name: string;
  export let primaryLabel: string;
  export let x: number; // Surface-space == CSS-pixel space today (disclosed, CanvasStage.svelte)
  export let y: number;
  export let selected: boolean;
</script>

<div class="chip" class:selected style="left: {x}px; top: {y}px;">
  <span class="name">{name}</span>
  <span class="value">{primaryLabel}</span>
</div>

<style>
  .chip {
    position: absolute;
    transform: translate(-50%, -50%);
    background: var(--af-surface-panel);
    border-radius: var(--af-radius-sm);
    box-shadow: var(--af-shadow-e1);
    padding: 4px 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    /* clicks pass through to the canvas beneath — shape selection stays owned by CanvasStage's
       hit-testing (studioSession.selectMeasurementAt), chips never become a second click target */
    pointer-events: none;
    white-space: nowrap;
    font-family: var(--af-font-ui);
  }

  .chip.selected {
    box-shadow: var(--af-shadow-e2), 0 0 0 1.5px var(--af-accent);
  }

  .name {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--af-ink-secondary);
    line-height: 1.2;
  }

  .value {
    font-size: 12.5px;
    font-weight: 650;
    color: var(--af-ink-primary);
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }
</style>
