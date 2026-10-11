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
  import MeasurementList from '../components/MeasurementList.svelte';
  import PropertyPanel from '../components/PropertyPanel.svelte';
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
  import { cancelDrag } from '../stores/vertexEditSession.js';
  import { splittingId, startSplit, cancelSplit, confirmSplit } from '../stores/splitSession.js';
  import { requestFitToContent } from '../stores/viewportSession.js';
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

  // PO follow-up (UX review, item A8 "shortcuts help overlay") — `?` toggles a static reference
  // panel (ShortcutsOverlay.svelte). While it's open, every other shortcut is swallowed (typical
  // modal behavior) except the two that close it again.
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

    // Calibration and drawing never interleave (Tool Dock is disabled while calibrating,
    // ToolDock.svelte) — block tool shortcuts/Enter/snap-toggle here too so a keypress outside
    // the calibration input can't arm a drawing tool mid-calibration.
    if ($calibrating) return;

    if (event.key === 'Enter') {
      handleEnter();
      confirmSplit(); // no-op unless a split line already crosses the boundary exactly twice
      return;
    }
    if (event.code === 'Digit1' && event.shiftKey) {
      // PO follow-up (UX review, item B8 "zoom-to-fit") — Shift+1, the same convention Figma
      // uses. `event.code` (not `event.key`) so this fires on the physical "1" key regardless of
      // what Shift+1 actually produces on the user's keyboard layout (e.g. '!' on US, '1' on some
      // European layouts that put digits behind Shift already).
      event.preventDefault();
      requestFitToContent();
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

<svelte:window on:keydown={onKeydown} />

<div class="shell">
  <TopBar projectName={$appState.project?.name ?? null} />
  <ImportCalibrationBanner />
  <CalibrationBar />
  <div class="main">
    <ToolDock />
    <MeasurementList />
    <CanvasStage />
    <PropertyPanel />
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
</style>
