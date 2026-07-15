<script lang="ts">
  // docs/16_DESIGN_SYSTEM.md §3.1 ToolDock — "плаващ долен-централен контейнер... Слотове ≤10...
  // role=toolbar, стрелки за навигация между слотовете." Pan/Curve/AI/Import slots are
  // intentionally absent this slice (docs/UI_CHECKPOINT_REVIEW.md next-slice scope) — the dock
  // grows additively as those capabilities land; 15 §11's "never changes position/composition
  // between breakpoints" invariant is about not *redesigning* the dock, not about shipping every
  // slot on day one.
  import { activeTool, setTool, type DrawingTool } from '../stores/drawingSession.js';

  interface ToolSpec {
    readonly id: DrawingTool;
    readonly label: string;
    readonly shortcut: string;
    readonly glyph: string;
  }

  const TOOLS: readonly ToolSpec[] = [
    { id: 'select', label: 'Select', shortcut: 'V', glyph: '▶' },
    { id: 'rectangle', label: 'Rectangle', shortcut: 'R', glyph: '▢' },
    { id: 'polygon', label: 'Polygon', shortcut: 'P', glyph: '⬠' },
    { id: 'circle', label: 'Circle', shortcut: 'C', glyph: '◯' },
    { id: 'freehand', label: 'Freehand', shortcut: 'F', glyph: '〜' },
    { id: 'line', label: 'Distance', shortcut: 'D', glyph: '⟋' },
  ];

  function onToolClick(id: DrawingTool, event: MouseEvent): void {
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
      title="{tool.label} ({tool.shortcut})"
      aria-pressed={$activeTool === tool.id}
      data-testid="tool-{tool.id}"
      on:click={(event) => onToolClick(tool.id, event)}
    >
      <span class="glyph" aria-hidden="true">{tool.glyph}</span>
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

  .glyph {
    font-size: 16px;
    line-height: 1;
  }
</style>
