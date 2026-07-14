<script lang="ts">
  // 15_UX_SPECIFICATION.md §6/W1 — Studio. This commit wires the CommandStack session in:
  // keyboard undo/redo (15 §13: ⌘Z / ⌘⇧Z, plus Ctrl+Y as the Windows redo convention) routed
  // through the studioSession store. Drawing tools that *produce* commands are the next commit
  // (Shape rendering) — until then commands enter only programmatically (tests / dev hook).
  import CanvasStage from '../components/CanvasStage.svelte';
  import StatusBar from '../components/StatusBar.svelte';
  import TopBar from '../components/TopBar.svelte';
  import { appState, goHome } from '../stores/appState.js';
  import { redo, undo } from '../stores/studioSession.js';

  function onKeydown(event: KeyboardEvent): void {
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;
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
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="shell">
  <TopBar projectName={$appState.project?.name ?? null} onBack={goHome} />
  <div class="main">
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
