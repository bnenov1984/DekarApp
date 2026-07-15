<script lang="ts">
  // 15_UX_SPECIFICATION.md §6/W1 — Studio. Keyboard undo/redo (15 §13: ⌘Z / ⌘⇧Z, plus Ctrl+Y as
  // the Windows redo convention) routed through the studioSession store. MeasurementList (left
  // panel, 15 §2.2 "ляво=данни") sits beside CanvasStage in the main row — it renders nothing of
  // its own when there are zero measurements (component-internal empty state, 15 §15).
  import CanvasStage from '../components/CanvasStage.svelte';
  import MeasurementList from '../components/MeasurementList.svelte';
  import StatusBar from '../components/StatusBar.svelte';
  import TopBar from '../components/TopBar.svelte';
  import { appState, goHome } from '../stores/appState.js';
  import { redo, undo } from '../stores/studioSession.js';
  import { handleEnter, handleEscape, setTool, toggleSnap, type DrawingTool } from '../stores/drawingSession.js';

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
    return tag === 'INPUT' || tag === 'TEXTAREA';
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
      handleEscape();
      return;
    }
    if (event.key === 'Enter') {
      handleEnter();
      return;
    }
    if (event.key.toLowerCase() === 's') {
      toggleSnap();
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
  <div class="main">
    <MeasurementList />
    <CanvasStage />
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
