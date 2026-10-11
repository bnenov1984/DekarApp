<script lang="ts">
  // 16 ZoomMenu / 15 §2.2 Zoom (PO, 2026-10-11) — the status bar's zoom %, and the menu it opens
  // above itself: a field to type a %, then Zoom to fit, 50/100/200%, Zoom in, Zoom out. Typed
  // values and steps are applied around the canvas center (viewportSession's center zoom
  // requests); the % itself is a plain read of $viewport, never a duplicate stored number.
  import { tick } from 'svelte';
  import { viewport, requestZoomTo, requestZoomStep, requestFitToContent } from '../stores/viewportSession.js';
  import { parseZoomPercent } from '../viewport/viewport.js';

  let open = false;
  let root: HTMLDivElement;
  let input: HTMLInputElement;

  $: zoomPercent = Math.round($viewport.scale * 100);

  // The field follows the live zoom (wheel, + / -) until the user starts typing in it.
  let draft = '';
  let dirty = false;
  $: if (!dirty) draft = `${zoomPercent}%`;

  async function toggle(): Promise<void> {
    open = !open;
    dirty = false;
    if (open) {
      await tick();
      input.focus();
      input.select();
    }
  }

  function close(): void {
    open = false;
    dirty = false;
  }

  function restoreField(): void {
    dirty = false;
    draft = `${zoomPercent}%`;
  }

  function onInputKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const scale = parseZoomPercent(draft);
    if (scale === null) {
      // 15 §2.2 — junk just shows the current value again, no message.
      restoreField();
      input.select();
      return;
    }
    requestZoomTo(scale);
    close();
  }

  function onMenuKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    // Only the menu closes — Studio's own Escape (deselect, cancel) stays out of it.
    event.stopPropagation();
    close();
  }

  function onWindowPointerDown(event: PointerEvent): void {
    if (open && !root.contains(event.target as Node)) close();
  }

  function choose(action: () => void): void {
    action();
    close();
  }

  const PRESETS = [0.5, 1, 2] as const;
</script>

<svelte:window on:pointerdown={onWindowPointerDown} />

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="zoom-menu" bind:this={root} on:keydown={onMenuKeydown}>
  <button
    type="button"
    class="zoom-indicator"
    on:click={toggle}
    aria-haspopup="dialog"
    aria-expanded={open}
    title="Zoom"
    aria-label="Zoom level {zoomPercent}%"
    data-testid="zoom-indicator"
  >
    {zoomPercent}%
  </button>

  {#if open}
    <div class="panel" role="dialog" aria-label="Zoom" data-testid="zoom-menu">
      <input
        bind:this={input}
        bind:value={draft}
        class="zoom-input"
        type="text"
        inputmode="decimal"
        aria-label="Zoom percent"
        data-testid="zoom-input"
        on:input={() => (dirty = true)}
        on:keydown={onInputKeydown}
        on:blur={restoreField}
      />
      <div class="separator"></div>
      <button type="button" class="item" data-testid="zoom-fit" on:click={() => choose(requestFitToContent)}>
        Zoom to fit <kbd>0</kbd>
      </button>
      {#each PRESETS as scale (scale)}
        <button type="button" class="item" data-testid="zoom-preset-{scale * 100}" on:click={() => choose(() => requestZoomTo(scale))}>
          {scale * 100}%
        </button>
      {/each}
      <div class="separator"></div>
      <!-- Zoom in/out keep the menu open, so it can be clicked repeatedly. -->
      <button type="button" class="item" data-testid="zoom-in" on:click={() => requestZoomStep(1)}>
        Zoom in <kbd>+</kbd>
      </button>
      <button type="button" class="item" data-testid="zoom-out" on:click={() => requestZoomStep(-1)}>
        Zoom out <kbd>−</kbd>
      </button>
    </div>
  {/if}
</div>

<style>
  .zoom-menu {
    position: relative;
  }

  .zoom-indicator {
    min-width: 44px;
    background: none;
    border: none;
    padding: 2px 6px;
    border-radius: var(--af-radius-sm);
    font: inherit;
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    color: var(--af-ink-secondary);
    cursor: pointer;
  }

  .zoom-indicator:hover,
  .zoom-indicator[aria-expanded='true'] {
    background: var(--af-surface-app);
    color: var(--af-ink-primary);
  }

  .zoom-indicator:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: 1px;
  }

  .panel {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    z-index: 40;
    width: 180px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    background: var(--af-surface-raised);
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-md);
    box-shadow: var(--af-shadow-e3);
    font-size: 12.5px;
  }

  .zoom-input {
    padding: 5px 8px;
    font: inherit;
    font-variant-numeric: tabular-nums;
    color: var(--af-ink-primary);
    background: var(--af-surface-app);
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-sm);
  }

  .zoom-input:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: -1px;
  }

  .separator {
    height: 1px;
    margin: 6px 0;
    background: var(--af-border-subtle);
  }

  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 8px;
    font: inherit;
    text-align: left;
    color: var(--af-ink-primary);
    background: none;
    border: none;
    border-radius: var(--af-radius-sm);
    cursor: pointer;
  }

  .item:hover {
    background: var(--af-surface-app);
  }

  .item:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: -2px;
  }

  kbd {
    font: inherit;
    font-size: 11px;
    color: var(--af-ink-tertiary);
  }
</style>
