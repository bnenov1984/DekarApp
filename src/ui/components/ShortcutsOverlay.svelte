<script lang="ts">
  // PO follow-up (UX review, item A8 "hidden gesture stack has zero discoverability") — a whole
  // tier of this app's own vocabulary (double-click to edit points, Shift-hold serial drawing,
  // Alt to disable snap, Ctrl+D, X to split, Space/middle-drag to pan, Shift+1 to fit) previously
  // had no in-product documentation anywhere. `?` (Studio.svelte) opens this; it's a static
  // reference list, not interactive — every entry here just documents a shortcut that already
  // exists elsewhere in the codebase, nothing is wired from this component.
  export let open: boolean;
  export let onClose: () => void;

  interface ShortcutGroup {
    readonly title: string;
    readonly items: readonly (readonly [string, string])[];
  }

  const GROUPS: readonly ShortcutGroup[] = [
    {
      title: 'Tools',
      items: [
        ['H', 'Pan'],
        ['R', 'Rectangle'],
        ['P', 'Polygon'],
        ['C', 'Circle'],
        ['F', 'Freehand'],
        ['D', 'Distance'],
        ['Shift + tool key', 'Keep the tool armed for repeated drawing'],
      ],
    },
    {
      title: 'Selection',
      items: [
        ['Click a shape', 'Select it — handles appear immediately, ready to drag'],
        ['Drag a selected shape', 'Move it, or drag a handle to resize/reshape it'],
        ['Shift-click a shape', 'Add/remove it from the current selection'],
        ['Click empty canvas', 'Deselect (or select the Background image, if clicked)'],
        ['Esc', 'Deselect everything / cancel the current action'],
        ['Double-click a handle', 'Label that point'],
        ['Double-click a name chip', 'Rename inline'],
      ],
    },
    {
      title: 'Editing',
      items: [
        ['Delete / Backspace', 'Delete the selected measurement(s)'],
        ['Ctrl/⌘ + D', 'Duplicate the selected measurement(s)'],
        ['X', 'Split the selected polygon'],
        ['Ctrl/⌘ + Z', 'Undo'],
        ['Ctrl/⌘ + Shift + Z (or Ctrl+Y)', 'Redo'],
        ['Enter', 'Confirm — finish a polygon, confirm a split, submit a calibration value'],
      ],
    },
    {
      title: 'View',
      items: [
        ['Scroll wheel, or + / −', 'Zoom in/out'],
        ['Space + drag, or middle-mouse drag', 'Pan'],
        ['0, or Shift + 1', 'Zoom to fit everything'],
        ['Click the zoom %', 'Type a zoom %, or pick 50 / 100 / 200%'],
        ['S', 'Toggle snap'],
        ['Alt (held)', 'Temporarily disable snap while dragging'],
        ['Shift (held, while drawing/editing)', 'Constrain to a straight angle'],
      ],
    },
  ];
</script>

{#if open}
  <!-- Click-outside-to-dismiss backdrop — Escape (Studio.svelte's global keydown handler,
       already required for this overlay regardless) is the keyboard-equivalent close path, so
       this div itself doesn't need to be a keyboard-focusable target. -->
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="backdrop" on:click={onClose} data-testid="shortcuts-overlay">
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      class="panel"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      on:click|stopPropagation
    >
      <div class="header">
        <h2>Keyboard shortcuts</h2>
        <button type="button" class="close-button" on:click={onClose} aria-label="Close" data-testid="shortcuts-close">
          ✕
        </button>
      </div>
      <div class="groups">
        {#each GROUPS as group (group.title)}
          <section class="group">
            <h3>{group.title}</h3>
            {#each group.items as [key, description] (key)}
              <div class="row">
                <kbd>{key}</kbd>
                <span>{description}</span>
              </div>
            {/each}
          </section>
        {/each}
      </div>
      <p class="footer-hint">Press <kbd>?</kbd> anytime to open this again.</p>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, black 45%, transparent);
  }

  .panel {
    width: min(680px, calc(100vw - 48px));
    max-height: calc(100vh - 96px);
    overflow: auto;
    background: var(--af-surface-raised);
    border-radius: var(--af-radius-lg);
    box-shadow: var(--af-shadow-e3);
    padding: 20px 24px;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 650;
    color: var(--af-ink-primary);
  }

  .close-button {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-radius: var(--af-radius-sm);
    color: var(--af-ink-secondary);
    font-size: 13px;
    cursor: pointer;
  }

  .close-button:hover {
    background: var(--af-surface-app);
    color: var(--af-ink-primary);
  }

  .close-button:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: 1px;
  }

  .groups {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  .group h3 {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--af-ink-tertiary);
  }

  .row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 5px 0;
    border-bottom: 1px solid var(--af-border-subtle);
  }

  .row:last-child {
    border-bottom: none;
  }

  .row span {
    font-size: 12.5px;
    color: var(--af-ink-secondary);
    line-height: 1.35;
  }

  kbd {
    flex: 0 0 auto;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    color: var(--af-ink-primary);
    background: var(--af-surface-app);
    border: 1px solid var(--af-border-subtle);
    border-radius: 4px;
    padding: 2px 6px;
    white-space: nowrap;
  }

  .footer-hint {
    margin: 16px 0 0;
    font-size: 11.5px;
    color: var(--af-ink-tertiary);
    text-align: center;
  }

  @media (max-width: 520px) {
    .groups {
      grid-template-columns: 1fr;
    }
  }
</style>
