<script lang="ts">
  // 15 §2.2 / W1, 16 §3.2 PanelShell (Photoshop layout, 2026-10-11) — the right column: Properties
  // on top, Layers below, a draggable divider between them. Always rendered, also on an empty
  // project, so the canvas never changes size when the first shape appears or the selection
  // changes. The divider's position lives in panelLayoutSession.ts.
  import PropertyPanel from './PropertyPanel.svelte';
  import MeasurementList from './MeasurementList.svelte';
  import {
    propertiesShare,
    setPropertiesShare,
    nudgePropertiesShare,
    resetPropertiesShare,
    shareFromPointer,
  } from '../stores/panelLayoutSession.js';

  let column: HTMLDivElement;
  let dragging = false;

  function onDividerPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onDividerPointerMove(event: PointerEvent): void {
    if (!dragging) return;
    const rect = column.getBoundingClientRect();
    setPropertiesShare(shareFromPointer(event.clientY, rect.top, rect.height));
  }

  function onDividerPointerUp(event: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  }

  function onDividerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    event.stopPropagation(); // keep Studio's own arrow-key handling (nudging a shape) out of this
    nudgePropertiesShare(event.key === 'ArrowDown' ? 0.05 : -0.05);
  }
</script>

<div class="right-column" bind:this={column} data-testid="right-column">
  <div class="properties-section" style="flex-basis: {$propertiesShare * 100}%">
    <PropertyPanel />
  </div>
  <!-- A focusable separator with aria-valuenow is the ARIA "window splitter" pattern, an
       interactive widget; Svelte's a11y check treats every separator as static, so it's silenced. -->
  <!-- svelte-ignore a11y-no-noninteractive-tabindex a11y-no-noninteractive-element-interactions -->
  <div
    class="divider"
    class:dragging
    role="separator"
    aria-orientation="horizontal"
    aria-label="Resize Properties and Layers"
    aria-valuemin={20}
    aria-valuemax={80}
    aria-valuenow={Math.round($propertiesShare * 100)}
    tabindex="0"
    title="Drag to resize · double-click to reset"
    data-testid="right-column-divider"
    on:pointerdown={onDividerPointerDown}
    on:pointermove={onDividerPointerMove}
    on:pointerup={onDividerPointerUp}
    on:pointercancel={onDividerPointerUp}
    on:dblclick={resetPropertiesShare}
    on:keydown={onDividerKeydown}
  ></div>
  <div class="layers-section">
    <MeasurementList />
  </div>
</div>

<style>
  .right-column {
    width: 280px;
    flex: 0 0 280px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--af-surface-panel);
    border-left: 1px solid var(--af-border-subtle);
  }

  .properties-section {
    flex-grow: 0;
    flex-shrink: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .layers-section {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /* A 1px line with a taller invisible grab area, so the divider is easy to hit. */
  .divider {
    position: relative;
    flex: 0 0 1px;
    background: var(--af-border-subtle);
    cursor: row-resize;
    touch-action: none;
  }

  .divider::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: -4px;
    bottom: -4px;
  }

  .divider:hover,
  .divider.dragging {
    background: var(--af-accent);
  }

  .divider:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: 0;
  }
</style>
