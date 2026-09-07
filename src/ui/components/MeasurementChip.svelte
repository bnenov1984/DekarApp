<script lang="ts">
  // 16_DESIGN_SYSTEM.md §3.1 MeasurementChip — "живият етикет върху фигурата: име + основна
  // стойност". Rendered as a positioned DOM element (not drawn on the canvas): text layout,
  // rounded background, and reliable readability over an arbitrary-colored fill are exactly what
  // Canvas2D is clumsy at and DOM/CSS is good at — the canvas owns geometry pixels, chips are UI
  // chrome anchored to it (21 §6.3 "successor projection" reasoning, same split as the
  // Measurement List a11y path, D8).
  //
  // PO request (chip inline rename): the chip is now interactive in Select mode — single click
  // selects (same store selectMeasurement converges on, so canvas/list/chip selection stay in
  // sync by construction), double-click renames in place. `interactive: false` (any drawing/
  // calibration/vertex-edit/split flow active) restores the original pointer-events:none
  // behavior so a crosshair drag over a chip never gets swallowed mid-draw.
  import { tick } from 'svelte';

  export let name: string;
  export let primaryLabel: string;
  export let x: number; // Surface-space == CSS-pixel space today (disclosed, CanvasStage.svelte)
  export let y: number;
  export let selected: boolean;
  export let interactive = false;
  // PO request (draggable polygon labels) — Polygon chips only (CanvasStage.svelte decides this
  // per-chip); when true, a mousedown that doesn't turn into a real drag still behaves exactly
  // like today (onSelect still fires from the native `click` event below, unchanged).
  export let draggable = false;
  export let onDragStart: (event: MouseEvent) => void = () => {};
  // PO follow-up (UX review, item A13 "multi-select") — the click event itself is now passed
  // through so the caller (CanvasStage.svelte) can check `event.shiftKey` and toggle this chip's
  // measurement in/out of a multi-selection instead of always replacing the whole selection.
  export let onSelect: (event: MouseEvent) => void = () => {};
  export let onRename: (name: string) => void = () => {};
  // PO follow-up (UX review, item A14 "no context menus") — right-click the chip, same as
  // right-clicking the shape on canvas (D8: every canvas gesture has a chip/list counterpart).
  export let onContextMenu: (event: MouseEvent) => void = () => {};

  let editing = false;
  let nameDraft = '';
  let inputEl: HTMLInputElement | undefined;

  function startEditing(): void {
    if (!interactive) return;
    editing = true;
    nameDraft = name;
    // focus once the input exists (same manual-focus-after-user-action pattern as the
    // calibration input, CanvasStage.svelte — the a11y lint disallows `autofocus`)
    void tick().then(() => {
      inputEl?.focus();
      inputEl?.select();
    });
  }

  function commit(): void {
    if (!editing) return;
    editing = false;
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
  }

  function cancel(): void {
    editing = false;
  }

  function onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
    // don't let Studio-level shortcuts (Delete/Backspace/tool keys) fire while typing a name
    event.stopPropagation();
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<!-- The Measurement List row is the keyboard-accessible path to selection and (via the
     Properties panel) renaming — D8, 15 §12: every canvas gesture has a list counterpart.
     This chip is a convenience pointer target layered over the canvas, not the a11y path. -->
<div
  class="chip"
  class:selected
  class:interactive
  style="left: {x}px; top: {y}px;"
  data-testid="measurement-chip"
  on:click|stopPropagation={(e) => interactive && onSelect(e)}
  on:dblclick|stopPropagation={startEditing}
  on:contextmenu|preventDefault|stopPropagation={(e) => interactive && onContextMenu(e)}
  on:mousedown|stopPropagation={(e) => interactive && draggable && onDragStart(e)}
>
  {#if editing}
    <input
      type="text"
      class="name-input"
      bind:this={inputEl}
      bind:value={nameDraft}
      on:blur={commit}
      on:keydown={onInputKeydown}
      aria-label="Rename measurement"
      data-testid="chip-name-input"
    />
  {:else}
    <span class="name">{name}</span>
  {/if}
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
    /* clicks pass through to the canvas beneath while a drawing/edit flow owns the pointer —
       shape selection stays owned by CanvasStage's hit-testing in that state */
    pointer-events: none;
    white-space: nowrap;
    font-family: var(--af-font-ui);
  }

  .chip.interactive {
    pointer-events: auto;
    cursor: pointer;
  }

  .chip.selected {
    box-shadow: var(--af-shadow-e2), 0 0 0 1.5px var(--af-accent);
  }

  /* PO request (label visual hierarchy) — the name is the more important line, so it now matches
     the value's font-size but reads as bold + the highest-contrast ink token (`--af-ink-primary`,
     white in the dark theme this app defaults to / near-black in light — not a hardcoded color,
     so it stays correct in both themes) instead of the previous smaller, secondary-ink text. */
  .name {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--af-ink-primary);
    line-height: 1.2;
  }

  .name-input {
    font-family: inherit;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--af-ink-primary);
    background: var(--af-surface-app);
    border: 1px solid var(--af-accent);
    border-radius: 3px;
    padding: 1px 4px;
    width: 96px;
    text-align: center;
  }

  /* PO request (label visual hierarchy) — now the secondary line: same size as .name, not bold,
     and the secondary-ink token so the name reads as the more prominent line above it. */
  .value {
    font-size: 12.5px;
    font-weight: 400;
    color: var(--af-ink-secondary);
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }
</style>
