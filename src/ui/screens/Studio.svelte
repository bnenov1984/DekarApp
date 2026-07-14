<script lang="ts">
  // 15_UX_SPECIFICATION.md §6/W1 — Studio: the screen where 95% of the product's time is spent.
  // This commit only wires Project identity into the Shell (name in TopBar, back-to-Home) —
  // CommandStack integration and Shape rendering are the next two commits in this sequence.
  import CanvasStage from '../components/CanvasStage.svelte';
  import StatusBar from '../components/StatusBar.svelte';
  import TopBar from '../components/TopBar.svelte';
  import { appState, goHome } from '../stores/appState.js';
</script>

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
