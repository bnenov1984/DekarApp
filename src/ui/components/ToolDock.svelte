<script lang="ts">
  // docs/16_DESIGN_SYSTEM.md §3.1 ToolDock — "плаващ долен-централен контейнер... Слотове ≤10...
  // role=toolbar, стрелки за навигация между слотовете." Pan/Curve/AI slots are still intentionally
  // absent this slice (docs/UI_CHECKPOINT_REVIEW.md next-slice scope) — the dock grows additively
  // as those capabilities land; 15 §11's "never changes position/composition between breakpoints"
  // invariant is about not *redesigning* the dock, not about shipping every slot on day one. Import
  // moved out to the top bar (15 §2.2, 2026-10-11): it is a file action, not a drawing tool.
  import { activeTool, setTool, type DrawingTool } from '../stores/drawingSession.js';
  import { calibrating } from '../stores/calibrationSession.js';
  import { splittingId } from '../stores/splitSession.js';
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

  // 16 §3.1 a11y: arrow-key navigation between slots (roving focus, toolbar pattern).
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const buttons = Array.from((event.currentTarget as HTMLElement).querySelectorAll('button'));
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex === -1) return;
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = buttons[(currentIndex + delta + buttons.length) % buttons.length];
    next?.focus();
  }
</script>

<div class="tool-dock" role="toolbar" tabindex="-1" aria-label="Drawing tools" data-testid="tool-dock" on:keydown={onKeydown}>
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
</div>

<style>
  .tool-dock {
    position: absolute;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    display: flex;
    gap: 2px;
    padding: 4px;
    background: var(--af-surface-raised);
    border-radius: var(--af-radius-lg);
    box-shadow: var(--af-shadow-e2);
  }

  .slot {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-radius: var(--af-radius-sm);
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
</style>
