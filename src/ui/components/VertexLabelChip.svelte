<script lang="ts">
  // 16_DESIGN_SYSTEM.md §3.1 VertexLabel (PD-028) — same "DOM projection of Shape/Measurement
  // data, never drawn on the canvas" split as MeasurementChip (21 §6.3), and the same
  // pointer-events:none/interactive toggle + click-vs-drag distinction (the drag-threshold gate
  // lives in CanvasStage.svelte/vertexLabelDragSession.ts, which decides whether a given
  // mousedown->mouseup turns into onSelect or a committed drag).
  //
  // Text/color editing stays exactly where it already was — vertex-edit mode, double-click the
  // *vertex handle dot* (not this chip), PropertyPanel.svelte's repurposed Notes field. This
  // component only adds what was missing from what used to be a rendered-but-fully-inert <div>:
  // select, drag-to-reposition, and double-click-to-reset.
  export let text: string;
  export let color: string;
  export let fontSizePx: number;
  export let x: number;
  export let y: number;
  export let interactive = false;
  // PO follow-up (UX review-style decision, grilling 2026-11-18, Q9) — a click that doesn't turn
  // into a drag selects the parent Measurement, same as clicking the shape/its MeasurementChip
  // already does — leaving it a dead click would read as a bug, not a deliberate no-op.
  export let onSelect: (event: MouseEvent) => void = () => {};
  export let onDragStart: (event: MouseEvent) => void = () => {};
  /** Grilling 2026-11-18, Q7 — double-click resets this label's offset back to centered-on-the-
   * vertex, the same "double-click returns to automatic" escape hatch the Properties panel's own
   * Layers/Properties divider already uses. */
  export let onReset: () => void = () => {};
</script>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<!-- Convenience pointer target only, same a11y split as MeasurementChip — the keyboard-
     accessible path to this label's text/color/size stays the Properties panel. -->
<div
  class="vertex-label-chip"
  class:interactive
  style="left: {x}px; top: {y}px; color: {color}; font-size: {fontSizePx}px;"
  data-testid="vertex-label-chip"
  on:click|stopPropagation={(e) => interactive && onSelect(e)}
  on:dblclick|stopPropagation={() => interactive && onReset()}
  on:mousedown|stopPropagation={(e) => interactive && onDragStart(e)}
>
  {text}
</div>

<style>
  .vertex-label-chip {
    position: absolute;
    transform: translate(8px, -8px);
    pointer-events: none;
    font-weight: 700;
    text-shadow:
      0 0 3px var(--af-surface-app),
      0 0 3px var(--af-surface-app),
      0 0 3px var(--af-surface-app);
    white-space: nowrap;
  }

  .vertex-label-chip.interactive {
    pointer-events: auto;
    cursor: grab;
  }
</style>
