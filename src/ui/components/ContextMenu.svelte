<script lang="ts">
  // PO follow-up (UX review, item A14 "no context menus") — a plain right-click menu positioned
  // at the cursor. Mounted once (Studio.svelte), driven by contextMenuSession.ts's store so any
  // component (CanvasStage, MeasurementList, MeasurementChip) can open it without owning its DOM.
  import { contextMenu, closeContextMenu } from '../contextMenu/contextMenuSession.js';

  // A Svelte action, not onMount — this needs to re-run every time the menu (re)opens. The #if
  // block below destroys/recreates the <div> on every open/close cycle, so an action (which fires
  // on element creation) naturally fires again each time, unlike onMount (once per component
  // lifetime — this whole component is mounted exactly once, at Studio.svelte's top level).
  // Clamps the already-set left/top (`$contextMenu.x/y`, the raw cursor position) so the menu
  // never renders partly off-screen for a right-click near the window's right/bottom edge.
  function clampToViewport(node: HTMLDivElement): void {
    const rect = node.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    node.style.left = `${Math.max(8, Math.min(rect.left, maxX))}px`;
    node.style.top = `${Math.max(8, Math.min(rect.top, maxY))}px`;
  }

  function runItem(action: () => void): void {
    action();
    closeContextMenu();
  }
</script>

{#if $contextMenu}
  <!-- Click-outside-to-dismiss backdrop, same pattern as ShortcutsOverlay.svelte's — a right-click
       on the backdrop also just closes the menu (rather than opening a second one, or bubbling to
       the native browser menu underneath). -->
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="backdrop"
    on:click={closeContextMenu}
    on:contextmenu|preventDefault={closeContextMenu}
    data-testid="context-menu-backdrop"
  ></div>
  <div
    class="menu"
    role="menu"
    use:clampToViewport
    style="left: {$contextMenu.x}px; top: {$contextMenu.y}px;"
    data-testid="context-menu"
  >
    {#each $contextMenu.items as item (item.label)}
      <button
        type="button"
        role="menuitem"
        class="item"
        class:danger={item.danger}
        disabled={item.disabled}
        on:click={() => runItem(item.action)}
        data-testid="context-menu-item-{item.label}"
      >
        {item.label}
      </button>
    {/each}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
  }

  .menu {
    position: fixed;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    min-width: 160px;
    padding: 4px;
    background: var(--af-surface-raised);
    border: 1px solid var(--af-border-strong);
    border-radius: var(--af-radius);
    box-shadow: var(--af-shadow-float);
  }

  .item {
    display: block;
    width: 100%;
    text-align: left;
    font: inherit;
    font-size: 12.5px;
    font-weight: 550;
    color: var(--af-ink-primary);
    background: none;
    border: none;
    padding: 7px 10px;
    border-radius: var(--af-radius);
    cursor: pointer;
  }

  .item:hover:not(:disabled) {
    background: var(--af-surface-app);
  }

  .item:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: -2px;
  }

  .item.danger {
    color: var(--af-danger);
  }

  .item:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
