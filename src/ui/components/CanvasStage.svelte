<script lang="ts">
  // docs/21_ARCHITECTURE.md §6 — CanvasStage is a thin mount for the Canvas2D scene; it never
  // owns geometry (ADR-002), only pixels. This bootstrap step establishes correct, DPI-aware
  // sizing — the foundation every later draw-call commit (UI commit 4) builds on — and nothing
  // else: no Shape rendering, no hit-testing yet.
  import { onDestroy, onMount } from 'svelte';

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let resizeObserver: ResizeObserver;

  function resizeToContainer(): void {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // bootstrap-only placeholder fill, proves the pixel pipeline is correctly sized end to end —
    // replaced by the raster/vector layer composition (21 §6.2) in UI commit 4.
    ctx.clearRect(0, 0, rect.width, rect.height);
  }

  onMount(() => {
    resizeToContainer();
    resizeObserver = new ResizeObserver(() => resizeToContainer());
    resizeObserver.observe(container);
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
  });
</script>

<div class="canvas-stage" bind:this={container} data-testid="canvas-stage">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .canvas-stage {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    background: var(--af-surface-app);
    overflow: hidden;
  }

  canvas {
    display: block;
  }
</style>
