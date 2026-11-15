<script lang="ts">
  // 15 §2.2 / W1, 16 §3.2 PanelShell (Photoshop layout, 2026-10-11; auto height, 2026-11-15 —
  // .scratch/properties-panel) — the right column: Properties on top, Layers below, a draggable
  // divider between them. Always rendered, also on an empty project, so the canvas never changes
  // size when the first shape appears or the selection changes. By default Properties is as tall
  // as its content (between MIN_PROPERTIES_PX and AUTO_MAX_PROPERTIES_SHARE of the column) and
  // Layers takes the rest; the divider is the user's override. Its state lives in
  // panelLayoutSession.ts.
  import { onMount } from 'svelte';
  import PropertyPanel from './PropertyPanel.svelte';
  import MeasurementList from './MeasurementList.svelte';
  import {
    propertiesShare,
    setPropertiesShare,
    nudgePropertiesShare,
    resetPropertiesShare,
    shareFromPointer,
    DEFAULT_PROPERTIES_SHARE,
    MIN_PROPERTIES_PX,
    AUTO_MAX_PROPERTIES_SHARE,
  } from '../stores/panelLayoutSession.js';

  let column: HTMLDivElement;
  let propertiesSection: HTMLDivElement;
  let dragging = false;

  // What the column actually gives Properties right now — the ARIA value of the divider in
  // automatic mode, and where a keyboard nudge from automatic starts. Read from layout when it
  // matters (the divider is focused, hovered or nudged) and kept fresh by a ResizeObserver in
  // between; a measurement is never the source of truth, the store is.
  let measuredShare = DEFAULT_PROPERTIES_SHARE;

  function measure(): number {
    const total = column?.offsetHeight ?? 0;
    return total > 0 ? propertiesSection.offsetHeight / total : DEFAULT_PROPERTIES_SHARE;
  }

  function refreshMeasuredShare(): void {
    measuredShare = measure();
  }

  onMount(() => {
    const observer = new ResizeObserver(refreshMeasuredShare);
    observer.observe(column);
    observer.observe(propertiesSection);
    return () => observer.disconnect();
  });

  $: automatic = $propertiesShare === null;
  $: currentShare = $propertiesShare ?? measuredShare;

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
    nudgePropertiesShare(event.key === 'ArrowDown' ? 0.05 : -0.05, measure());
  }
</script>

<div
  class="right-column"
  bind:this={column}
  style="--properties-min: {MIN_PROPERTIES_PX}px; --properties-max: {AUTO_MAX_PROPERTIES_SHARE * 100}%"
  data-testid="right-column"
>
  <div
    class="properties-section"
    class:automatic
    bind:this={propertiesSection}
    style={automatic ? '' : `flex-basis: ${currentShare * 100}%`}
    data-testid="properties-section"
  >
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
    aria-valuenow={Math.round(currentShare * 100)}
    tabindex="0"
    title={automatic ? 'Drag to resize' : 'Drag to resize · double-click to fit content'}
    data-testid="right-column-divider"
    on:focus={refreshMeasuredShare}
    on:pointerenter={refreshMeasuredShare}
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

  /* Override: a fixed share of the column (flex-basis set inline), as before. */
  .properties-section {
    flex-grow: 0;
    flex-shrink: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /* Automatic: as tall as its content, within the bounds; PropertyPanel scrolls only past the cap. */
  .properties-section.automatic {
    flex-basis: auto;
    flex-shrink: 1;
    min-height: var(--properties-min);
    max-height: var(--properties-max);
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
