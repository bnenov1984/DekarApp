<script lang="ts">
  // 15_UX_SPECIFICATION.md §1.1 Shell/Studio layout skeleton. Bootstrap scope only (UI commit 1,
  // CONTRIBUTING.md sequence): TopBar + blank CanvasStage + StatusBar, correctly sized and
  // themed. No Project/Surface data, no CommandStack, no Shape rendering yet — those are the
  // next four commits in the same sequence, each its own logical change.
  import CanvasStage from './components/CanvasStage.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import TopBar from './components/TopBar.svelte';
</script>

<div class="shell">
  <TopBar />
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
