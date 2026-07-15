<script lang="ts">
  // 15_UX_SPECIFICATION.md §6/W1 — Studio. Keyboard undo/redo (15 §13: ⌘Z / ⌘⇧Z, plus Ctrl+Y as
  // the Windows redo convention) routed through the studioSession store. MeasurementList (left
  // panel, 15 §2.2 "ляво=данни") and PropertyPanel (right panel, 16 §3.2) flank CanvasStage in
  // the main row — both render nothing of their own when there's nothing to show them (empty
  // list / no selection, same component-internal empty state pattern, 15 §15).
  import CalibrationBar from '../components/CalibrationBar.svelte';
  import CanvasStage from '../components/CanvasStage.svelte';
  import MeasurementList from '../components/MeasurementList.svelte';
  import PropertyPanel from '../components/PropertyPanel.svelte';
  import StatusBar from '../components/StatusBar.svelte';
  import TopBar from '../components/TopBar.svelte';
  import { appState, goHome } from '../stores/appState.js';
  import { redo, undo, selectedMeasurementId } from '../stores/studioSession.js';
  import { activeTool, handleEnter, handleEscape, setTool, toggleSnap, type DrawingTool } from '../stores/drawingSession.js';
  import { calibrating, cancelCalibration } from '../stores/calibrationSession.js';
  import { vertexEditingId, exitVertexEditing } from '../stores/vertexEditSession.js';
  import { splittingId, startSplit, cancelSplit, confirmSplit } from '../stores/splitSession.js';

  // 15_UX_SPECIFICATION.md §13 — single-key tool shortcuts (V/R/P/C/F/D). Pan/Curve/AI keys are
  // absent because those tools don't exist this slice (docs/UI_CHECKPOINT_REVIEW.md next-slice
  // scope note, also in ToolDock.svelte).
  const TOOL_KEYS: Readonly<Record<string, DrawingTool>> = {
    v: 'select',
    r: 'rectangle',
    p: 'polygon',
    c: 'circle',
    f: 'freehand',
    d: 'line',
  };

  function isTypingTarget(target: EventTarget | null): boolean {
    const tag = (target as HTMLElement | null)?.tagName;
    // 'SELECT' included for the calibration unit dropdown (CanvasStage.svelte) — without it, a
    // native typeahead keypress there (e.g. "f" to jump to the "ft" option) would also fire the
    // Freehand tool shortcut below.
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function onKeydown(event: KeyboardEvent): void {
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
      }
      return;
    }

    if (isTypingTarget(event.target)) return;

    if (event.key === 'Escape') {
      // Harmless no-op on whichever of the four isn't currently active (drawingSession.handleEscape
      // clears a null draft silently; the other three cancel/exit functions are no-ops when not active).
      cancelCalibration();
      handleEscape();
      exitVertexEditing();
      cancelSplit();
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
    if (event.key.toLowerCase() === 's') {
      toggleSnap();
      return;
    }
    if (event.key.toLowerCase() === 'x') {
      // 15 §13 / §5 F7 — Split a selected Polygon. Guarded against vertex-editing/already-
      // splitting so `X` can't stack sessions; startSplit itself no-ops for non-Polygon shapes.
      if ($activeTool === 'select' && !$vertexEditingId && !$splittingId && $selectedMeasurementId) {
        startSplit($selectedMeasurementId);
      }
      return;
    }

    const tool = TOOL_KEYS[event.key.toLowerCase()];
    if (tool) {
      // 15 §14.1 — holding Shift while activating a tool keeps it armed for serial drawing.
      setTool(tool, { keepArmed: event.shiftKey });
    }
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="shell">
  <TopBar projectName={$appState.project?.name ?? null} onBack={goHome} />
  <CalibrationBar />
  <div class="main">
    <MeasurementList />
    <CanvasStage />
    <PropertyPanel />
  </div>
  <StatusBar />
</div>

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
