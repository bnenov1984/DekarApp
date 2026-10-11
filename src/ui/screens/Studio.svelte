<script lang="ts">
  // 15_UX_SPECIFICATION.md §6/W1 — Studio. Keyboard undo/redo (15 §13: ⌘Z / ⌘⇧Z, plus Ctrl+Y as
  // the Windows redo convention) routed through the studioSession store. MeasurementList (left
  // panel, 15 §2.2 "ляво=данни") and PropertyPanel (right panel, 16 §3.2) flank CanvasStage in
  // the main row — both render nothing of their own when there's nothing to show them (empty
  // list / no selection, same component-internal empty state pattern, 15 §15).
  import CalibrationBar from '../components/CalibrationBar.svelte';
  import ImportCalibrationBanner from '../components/ImportCalibrationBanner.svelte';
  import CanvasStage from '../components/CanvasStage.svelte';
  import ToolDock from '../components/ToolDock.svelte';
  import RightColumn from '../components/RightColumn.svelte';
  import StatusBar from '../components/StatusBar.svelte';
  import TopBar from '../components/TopBar.svelte';
  import ShortcutsOverlay from '../components/ShortcutsOverlay.svelte';
  import ContextMenu from '../components/ContextMenu.svelte';
  import { contextMenu, closeContextMenu } from '../contextMenu/contextMenuSession.js';
  import { appState } from '../stores/appState.js';
  import {
    redo,
    undo,
    selectedMeasurementId,
    deleteSelectedMeasurement,
    duplicateSelectedMeasurement,
    deselectAll,
  } from '../stores/studioSession.js';
  import { activeTool, handleEnter, handleEscape, setTool, toggleSnap, type DrawingTool } from '../stores/drawingSession.js';
  import { calibrating, cancelCalibration } from '../stores/calibrationSession.js';
  import {
    layoutMode,
    viewOnly,
    setViewportWidth,
    sidePanelsHidden,
    toggleSidePanels,
    rightOverlayOpen,
    toggleRightOverlay,
    closeRightOverlay,
  } from '../stores/panelLayoutSession.js';
  import Icon from '../components/Icon.svelte';
  import { cancelDrag } from '../stores/vertexEditSession.js';
  import { splittingId, startSplit, cancelSplit, confirmSplit, closeSplitConfig } from '../stores/splitSession.js';
  import { requestFitToContent, requestZoomStep } from '../stores/viewportSession.js';
  import { shortcutsOverlayOpen, openShortcutsOverlay, closeShortcutsOverlay } from '../stores/shortcutsOverlaySession.js';

  // 15_UX_SPECIFICATION.md §13 — single-key tool shortcuts. PO follow-up ("replace Select tool
  // with Pan") — `V` (Select) is retired along with the tool itself; `H` ("hand") is Pan's new
  // shortcut, deliberately not `V` (Figma/Illustrator's `V` means Select, not Pan/Hand — those
  // tools use `H` for Pan, and reusing `V` here would carry the wrong muscle-memory expectation).
  // Curve/AI keys are still absent because those tools don't exist this slice
  // (docs/UI_CHECKPOINT_REVIEW.md next-slice scope note, also in ToolDock.svelte).
  const TOOL_KEYS: Readonly<Record<string, DrawingTool>> = {
    h: 'pan',
    r: 'rectangle',
    p: 'polygon',
    c: 'circle',
    f: 'freehand',
    d: 'line',
  };

  function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    // 'SELECT' included for the calibration unit dropdown (CanvasStage.svelte) — without it, a
    // native typeahead keypress there (e.g. "f" to jump to the "ft" option) would also fire the
    // Freehand tool shortcut below. `isContentEditable` covers any future rich-text field even
    // though nothing in this app uses contenteditable today.
    return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT' || el?.isContentEditable === true;
  }

  // 15 §13 / §2.2 Zoom (PO, 2026-10-11) — the viewing keys, also in view-only (PD-022): `+`/`=` and
  // `-` zoom one ×1.1 step around the canvas center, `0` and Shift+1 zoom to fit. Shift+1 matches
  // `event.code` (the physical "1" key — Figma's convention), since what Shift+1 types depends on
  // the keyboard layout. Returns whether the key was a zoom key.
  function handleZoomKey(event: KeyboardEvent): boolean {
    if (event.code === 'Digit1' && event.shiftKey) {
      requestFitToContent();
    } else if (event.key === '+' || event.key === '=') {
      requestZoomStep(1);
    } else if (event.key === '-') {
      requestZoomStep(-1);
    } else if (event.key === '0') {
      requestFitToContent();
    } else {
      return false;
    }
    event.preventDefault();
    return true;
  }

  // PO follow-up (UX review, item A8 "shortcuts help overlay") — `?` toggles a static reference
  // panel (ShortcutsOverlay.svelte). While it's open, every other shortcut is swallowed (typical
  // modal behavior) except the two that close it again.
  // 15 §11 — the layout follows the window width (full / compact / view-only).
  let innerWidth = typeof window === 'undefined' ? 1400 : window.innerWidth;
  $: setViewportWidth(innerWidth);

  // Dropping into view-only (PD-022) ends whatever editing was in progress — nothing it could
  // commit would be accepted anyway (studioSession.ts refuses every command there).
  $: if ($viewOnly) leaveEditing();

  function leaveEditing(): void {
    setTool(null);
    cancelCalibration();
    cancelSplit();
    closeSplitConfig();
    cancelDrag();
    closeContextMenu();
  }

  // Tab hides/shows both side columns (15 §11, Photoshop idiom) — only when focus isn't on a
  // field or a control, so keyboard navigation through the panels' own controls keeps working.
  function isControlTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el || el === document.body) return false;
    return el.closest('button, a[href], input, textarea, select, [tabindex], [contenteditable="true"]') !== null;
  }

  function onKeydown(event: KeyboardEvent): void {
    if ($shortcutsOverlayOpen) {
      if (event.key === 'Escape' || event.key === '?') {
        event.preventDefault();
        closeShortcutsOverlay();
      }
      return;
    }

    // PO follow-up (UX review, item A14 "no context menus") — Escape closes an open menu the same
    // way it closes the shortcuts overlay above, swallowing every other key while it's open
    // (typical menu behavior — e.g. Delete shouldn't fire "through" an open right-click menu).
    if ($contextMenu) {
      if (event.key === 'Escape') closeContextMenu();
      return;
    }

    const mod = event.ctrlKey || event.metaKey;

    if (event.key === 'Tab' && !mod && !event.altKey && !isControlTarget(event.target)) {
      event.preventDefault();
      toggleSidePanels();
      return;
    }

    if ($viewOnly) {
      // PD-022 — view-only keeps only the viewing shortcuts: help, Escape, zoom.
      if (isTypingTarget(event.target)) return;
      if (event.key === '?') {
        event.preventDefault();
        openShortcutsOverlay();
      } else if (event.key === 'Escape') {
        closeRightOverlay();
        deselectAll();
      } else {
        handleZoomKey(event);
      }
      return;
    }

    if (mod) {
      const key = event.key.toLowerCase();
      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (key === 'z') {
        event.preventDefault();
        undo();
      } else if (key === 'y') {
        event.preventDefault();
        redo();
      } else if (key === 'd') {
        // PO follow-up (UX review, item B6 "Ctrl+D duplicate") — preventDefault: Ctrl/Cmd+D is
        // the browser's own "bookmark this page" shortcut everywhere else.
        event.preventDefault();
        duplicateSelectedMeasurement();
      }
      return;
    }

    if (isTypingTarget(event.target)) return;

    if (event.key === '?') {
      event.preventDefault();
      openShortcutsOverlay();
      return;
    }

    if (event.key === 'Escape') {
      closeRightOverlay();
      // Harmless no-op on whichever of the four isn't currently active (drawingSession.handleEscape
      // clears a null draft silently; the other three cancel/exit functions are no-ops when not active).
      cancelCalibration();
      handleEscape();
      cancelDrag();
      cancelSplit();
      // PO follow-up (deselect-on-empty-click / Escape) — Escape now also always clears whatever
      // is selected (Measurement or Background), matching the click-outside-to-deselect gesture
      // and every commercial graphics tool's Escape behavior.
      deselectAll();
      return;
    }

    // Zooming is only viewing, so it works mid-calibration and mid-drawing too.
    if (handleZoomKey(event)) return;

    // Calibration and drawing never interleave (Tool Dock is disabled while calibrating,
    // ToolDock.svelte) — block tool shortcuts/Enter/snap-toggle here too so a keypress outside
    // the calibration input can't arm a drawing tool mid-calibration.
    if ($calibrating) return;

    if (event.key === 'Enter') {
      handleEnter();
      confirmSplit(); // no-op unless a split line already crosses the boundary exactly twice
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && !$splittingId) {
      // 15 §13 — deletes the selected Measurement. Split-parent/split-child/plain lifecycle
      // rules already live in deleteMeasurementCommand (11 §4); this just also cancels any
      // in-progress drag preview if the deleted measurement was mid-drag (harmless no-op
      // otherwise). preventDefault: Backspace outside a text field is the browser's "navigate
      // back" shortcut.
      event.preventDefault();
      deleteSelectedMeasurement();
      cancelDrag();
      return;
    }
    if (event.key.toLowerCase() === 's') {
      toggleSnap();
      return;
    }
    if (event.key.toLowerCase() === 'x') {
      // 15 §13 / §5 F7 — Split a selected Polygon. Only in the neutral interaction state
      // (`activeTool === null`) — guarded against an active drawing/Pan tool so it can't fire
      // mid-draw, and against already-splitting so `X` can't stack sessions; startSplit itself
      // no-ops for non-Polygon shapes.
      if ($activeTool === null && !$splittingId && $selectedMeasurementId) {
        startSplit($selectedMeasurementId);
      }
      return;
    }

    const tool = TOOL_KEYS[event.key.toLowerCase()];
    if (tool) {
      // Pressing the shortcut for the already-active tool again leaves it (same toggle-to-neutral
      // convention as ToolDock's own button click, PO follow-up "neutral interaction state").
      if ($activeTool === tool) {
        setTool(null);
        return;
      }
      // 15 §14.1 — holding Shift while activating a tool keeps it armed for serial drawing.
      setTool(tool, { keepArmed: event.shiftKey });
    }
  }
</script>

<svelte:window on:keydown={onKeydown} bind:innerWidth />

<div class="shell">
  <TopBar projectName={$appState.project?.name ?? null} />
  <ImportCalibrationBanner />
  <CalibrationBar />
  <!-- 15 §11 — ≥1280: tool bar, canvas, docked right column. 1024–1279: the right column is a
       strip on the edge that opens it as an overlay (the canvas doesn't shrink). <1024 view-only:
       no tool bar. Tab hides both side columns at any width. -->
  <div class="main">
    {#if !$viewOnly && !$sidePanelsHidden}
      <ToolDock />
    {/if}
    <div class="canvas-area">
      <CanvasStage />
      {#if $layoutMode !== 'full' && !$sidePanelsHidden && $rightOverlayOpen}
        <div class="right-overlay" data-testid="right-column-overlay">
          <RightColumn />
        </div>
      {/if}
    </div>
    {#if !$sidePanelsHidden}
      {#if $layoutMode === 'full'}
        <RightColumn />
      {:else}
        <button
          type="button"
          class="right-strip"
          class:open={$rightOverlayOpen}
          aria-expanded={$rightOverlayOpen}
          aria-label={$rightOverlayOpen ? 'Close Properties and Layers' : 'Open Properties and Layers'}
          title="Properties and Layers"
          data-testid="right-column-strip"
          on:click={toggleRightOverlay}
        >
          <Icon name="layers" size={16} />
          <span class="right-strip-label">Properties · Layers</span>
        </button>
      {/if}
    {/if}
  </div>
  <StatusBar />
</div>
<ShortcutsOverlay open={$shortcutsOverlayOpen} onClose={closeShortcutsOverlay} />
<ContextMenu />

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .main {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  /* Holds the canvas and, at compact/view-only sizes, the right column overlaid on its right edge. */
  .canvas-area {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
  }

  .right-overlay {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    display: flex;
    box-shadow: var(--af-shadow-e2);
  }

  .right-strip {
    flex: 0 0 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 12px 0;
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--af-ink-secondary);
    background: var(--af-surface-panel);
    border: none;
    border-left: 1px solid var(--af-border-subtle);
    cursor: pointer;
  }

  .right-strip:hover,
  .right-strip.open {
    color: var(--af-ink-primary);
    background: var(--af-surface-app);
  }

  .right-strip:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: -2px;
  }

  .right-strip-label {
    writing-mode: vertical-rl;
    white-space: nowrap;
  }
</style>
