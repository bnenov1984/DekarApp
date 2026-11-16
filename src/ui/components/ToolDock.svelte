<script lang="ts">
  // docs/16_DESIGN_SYSTEM.md §3.1 ToolBar (Photoshop layout, 15 §2.2/W1, 2026-10-11) — a vertical
  // bar docked to the left edge, full height between the top bar and the status bar, icons only.
  // It replaced the floating bottom-centre dock (15 D1, superseded). Slots: the drawing tools, a
  // divider, then Split — the same manual line split as the `X` key, disabled (never hidden) when
  // the selection can't be split, so no slot ever appears or disappears. Import is a file action
  // and lives in the top bar (ImportButton.svelte). Curve/AI slots are still absent: the bar grows
  // additively as those capabilities land.
  import { activeTool, setTool, type DrawingTool } from '../stores/drawingSession.js';
  import { calibrating } from '../stores/calibrationSession.js';
  import { splittingId, canStartSplit, toggleSplitTool } from '../stores/splitSession.js';
  import { activeSurface, selectedMeasurementId } from '../stores/studioSession.js';
  import Icon from './Icon.svelte';

  interface ToolSpec {
    readonly id: DrawingTool;
    readonly label: string;
    readonly shortcut: string;
    readonly icon: 'pan' | 'rectangle' | 'polygon' | 'circle' | 'freehand' | 'line';
  }

  // PO follow-up ("replace Select tool with Pan") — Select is gone (selection is a direct, always-
  // available canvas interaction now, studioSession.ts — no toolbar mode needed for it); Pan takes
  // its place as the first slot, the idle/default tool. Every slot now renders through Icon.svelte
  // instead of a raw Unicode glyph — this file was the one remaining holdout from that migration
  // (Icon.svelte's own header comment), and introducing a brand-new glyph just for Pan would have
  // added a second, contradictory icon convention at the exact moment the rest of the dock could
  // just as easily join the existing one.
  const TOOLS: readonly ToolSpec[] = [
    { id: 'pan', label: 'Pan', shortcut: 'H', icon: 'pan' },
    { id: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: 'rectangle' },
    { id: 'polygon', label: 'Polygon', shortcut: 'P', icon: 'polygon' },
    { id: 'circle', label: 'Circle', shortcut: 'C', icon: 'circle' },
    { id: 'freehand', label: 'Freehand', shortcut: 'F', icon: 'freehand' },
    { id: 'line', label: 'Distance', shortcut: 'D', icon: 'line' },
  ];

  // PO follow-up ("neutral interaction state") — clicking the already-active tool again leaves it,
  // returning to the neutral state (`activeTool: null`) rather than re-arming the same tool —
  // "leaving the Pan tool returns to the neutral interaction state" applies uniformly to every
  // slot, not just Pan, for the same reason a toggle button reads as one consistent affordance.
  function onToolClick(id: DrawingTool, event: MouseEvent): void {
    if ($activeTool === id) {
      setTool(null);
      return;
    }
    setTool(id, { keepArmed: event.shiftKey });
  }

  // Re-evaluated whenever the Surface (lock, shape type), the selection or the split state changes.
  $: splitEnabled = $splittingId !== null || ($activeSurface !== null && canStartSplit($selectedMeasurementId));

  // 16 §3.1 a11y: arrow-key navigation between slots (roving focus, vertical toolbar pattern).
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const buttons = Array.from((event.currentTarget as HTMLElement).querySelectorAll('button'));
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex === -1) return;
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const next = buttons[(currentIndex + delta + buttons.length) % buttons.length];
    next?.focus();
  }
</script>

<div
  class="tool-dock"
  role="toolbar"
  tabindex="-1"
  aria-label="Drawing tools"
  aria-orientation="vertical"
  data-testid="tool-dock"
  on:keydown={onKeydown}
>
  {#each TOOLS as tool (tool.id)}
    <button
      type="button"
      class="slot"
      class:active={$activeTool === tool.id}
      title={tool.id === 'pan' ? `Pan (${tool.shortcut}) — drag to move the view` : `${tool.label} (${tool.shortcut})`}
      aria-label={tool.label}
      aria-pressed={$activeTool === tool.id}
      disabled={$calibrating || !!$splittingId}
      data-testid="tool-{tool.id}"
      on:click={(event) => onToolClick(tool.id, event)}
    >
      <Icon name={tool.icon} size={18} />
    </button>
  {/each}
  <span class="divider" aria-hidden="true"></span>
  <button
    type="button"
    class="slot"
    class:active={$splittingId !== null}
    title={splitEnabled ? 'Split (X) — draw a line across the selected polygon' : 'Split (X) — select an unlocked polygon first'}
    aria-label="Split"
    aria-pressed={$splittingId !== null}
    disabled={$calibrating || !splitEnabled}
    data-testid="tool-split"
    on:click={() => toggleSplitTool($selectedMeasurementId)}
  >
    <Icon name="split" size={18} />
  </button>
</div>

<style>
  .tool-dock {
    flex: 0 0 44px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 0;
    background: var(--af-surface-panel);
    border-right: 1px solid var(--af-border-subtle);
  }

  .slot {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-radius: var(--af-radius);
    color: var(--af-ink-secondary);
    cursor: pointer;
  }

  .slot:hover {
    background: var(--af-surface-app);
  }

  .slot:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: -2px;
  }

  .slot.active {
    background: color-mix(in srgb, var(--af-accent) 14%, transparent);
    color: var(--af-accent);
  }

  .slot:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .divider {
    width: 24px;
    height: 1px;
    margin: 4px 0;
    background: var(--af-border-subtle);
  }
</style>
