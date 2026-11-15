<script lang="ts">
  // 16 §3.2 PropertyPanel · .scratch/properties-panel spec, decision 3 (PO, 2026-11-15) — the
  // "split into parts" form, opened by PropertyPanel's Split button as a popover beside the
  // panel instead of inline in it. Inline, the ~180px form lived inside a panel that scrolls, so
  // its confirm button regularly fell below the fold with "Delete shape" pinned over it. The
  // popover is positioned `fixed` from the button's rect because the panel's `overflow: auto`
  // would clip a positioned child. Close rules follow ZoomMenu: Escape (stopped, so Studio's own
  // Escape doesn't also deselect), a pointer down outside, or the action itself. The config
  // stores stay in splitSession.ts — this component owns nothing but placement.
  import { onMount, tick } from 'svelte';
  import {
    splitPartsCount,
    splitDistribution,
    splitPartsError,
    confirmSplitParts,
    closeSplitConfig,
  } from '../stores/splitSession.js';

  /** The Split button the popover hangs off. */
  export let anchor: HTMLElement;
  /** PropertyPanel's "Manual split (draw a line)" fallback — it owns the measurement id. */
  export let onManualSplit: () => void;

  const WIDTH = 248;
  const GAP = 8;
  const MARGIN = 8;

  let root: HTMLDivElement;
  let firstControl: HTMLButtonElement;
  let top = 0;
  let left = 0;

  /** Left of the button, top-aligned with it; pulled up if it would run off the bottom. */
  function place(): void {
    if (!anchor || !root) return;
    const rect = anchor.getBoundingClientRect();
    left = Math.max(MARGIN, rect.left - GAP - WIDTH);
    top = Math.min(Math.max(MARGIN, rect.top), window.innerHeight - root.offsetHeight - MARGIN);
  }

  onMount(async () => {
    await tick();
    place();
    firstControl?.focus();
  });

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    closeSplitConfig();
    anchor?.focus();
  }

  function onWindowPointerDown(event: PointerEvent): void {
    const target = event.target as Node;
    if (root.contains(target) || anchor.contains(target)) return;
    closeSplitConfig();
  }

  function setCount(raw: string): void {
    splitPartsCount.set(Math.max(2, Math.min(24, Number(raw) || 2)));
  }
</script>

<svelte:window on:pointerdown={onWindowPointerDown} on:resize={place} on:scroll|capture={place} />

<!-- A dialog that handles its own Escape; Svelte's a11y check treats dialog as non-interactive. -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
  class="popover"
  bind:this={root}
  role="dialog"
  aria-label="Split into parts"
  tabindex="-1"
  style="top: {top}px; left: {left}px; width: {WIDTH}px"
  on:keydown={onKeydown}
  data-testid="split-config"
>
  <div class="title">Split into parts</div>

  <label class="label" for="split-parts-count">Number of parts</label>
  <div class="count-row">
    {#each [2, 3, 4] as n, i (n)}
      {#if i === 0}
        <button
          type="button"
          class="preset"
          class:active={$splitPartsCount === n}
          bind:this={firstControl}
          on:click={() => splitPartsCount.set(n)}
          data-testid="split-count-{n}"
        >
          {n}
        </button>
      {:else}
        <button
          type="button"
          class="preset"
          class:active={$splitPartsCount === n}
          on:click={() => splitPartsCount.set(n)}
          data-testid="split-count-{n}"
        >
          {n}
        </button>
      {/if}
    {/each}
    <input
      id="split-parts-count"
      type="number"
      min="2"
      max="24"
      step="1"
      class="count-input"
      value={$splitPartsCount}
      on:input={(e) => setCount(e.currentTarget.value)}
      aria-label="Custom number of parts"
      data-testid="split-count-custom"
    />
  </div>

  <span class="label">Distribution</span>
  <div class="distribution-row" role="group" aria-label="Distribution">
    <button
      type="button"
      class="preset"
      class:active={$splitDistribution === 'equal'}
      on:click={() => splitDistribution.set('equal')}
      data-testid="split-distribution-equal"
    >
      Equal
    </button>
    <button
      type="button"
      class="preset"
      class:active={$splitDistribution === 'random'}
      on:click={() => splitDistribution.set('random')}
      data-testid="split-distribution-random"
    >
      Random
    </button>
  </div>

  {#if $splitPartsError}
    <p class="error" data-testid="split-error">{$splitPartsError}</p>
  {/if}

  <button type="button" class="confirm" on:click={confirmSplitParts} data-testid="split-confirm">
    Split polygon
  </button>
  <button type="button" class="manual-link" on:click={onManualSplit} data-testid="manual-split-link">
    Manual split (draw a line)
  </button>
</div>

<style>
  .popover {
    position: fixed;
    z-index: 40; /* popover layer (16 §3.1 Z-scale), same as ZoomMenu */
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--af-surface-raised);
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-md);
    box-shadow: var(--af-shadow-e3);
    outline: none;
  }

  .title {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--af-ink-primary);
    margin-bottom: 2px;
  }

  .label {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--af-ink-secondary);
  }

  .count-row,
  .distribution-row {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .preset {
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--af-ink-secondary);
    background: var(--af-surface-panel);
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-sm);
    padding: 5px 10px;
    cursor: pointer;
  }

  .preset.active {
    color: var(--af-accent-ink);
    background: var(--af-accent);
    border-color: var(--af-accent);
  }

  .preset:focus-visible,
  .count-input:focus-visible,
  .confirm:focus-visible,
  .manual-link:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: 1px;
  }

  .count-input {
    width: 48px;
    font: inherit;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    color: var(--af-ink-primary);
    background: var(--af-surface-panel);
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-sm);
    padding: 5px 6px;
    text-align: right;
  }

  .error {
    margin: 0;
    font-size: 11.5px;
    color: var(--af-danger);
  }

  .confirm {
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--af-accent-ink);
    background: var(--af-accent);
    border: none;
    border-radius: var(--af-radius-sm);
    padding: 7px 10px;
    cursor: pointer;
  }

  .manual-link {
    font: inherit;
    font-size: 11.5px;
    color: var(--af-ink-tertiary);
    background: none;
    border: none;
    padding: 2px;
    text-align: left;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
