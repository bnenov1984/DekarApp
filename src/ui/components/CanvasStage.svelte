<script lang="ts">
  // docs/21_ARCHITECTURE.md §6 — CanvasStage mounts the Canvas2D scene and never owns geometry
  // (ADR-002); actual draw calls live in rendering/sceneRenderer.ts (a pure, testable module),
  // this component only wires DPI-aware sizing + redraw triggers + click hit-testing to it.
  //
  // Surface space == CSS-pixel canvas space for now (no pan/zoom/calibration-to-screen mapping
  // yet — that's a disclosed, later concern; nothing in 21 §6 requires it to exist before shapes
  // can render and be selected).
  import { onDestroy, onMount } from 'svelte';
  import { activeSurface, selectedMeasurementId, selectMeasurementAt } from '../stores/studioSession.js';
  import { drawSurface } from '../rendering/sceneRenderer.js';

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let resizeObserver: ResizeObserver;
  let darkSchemeQuery: MediaQueryList;
  let ctx: CanvasRenderingContext2D | null = null;
  let widthCss = 0;
  let heightCss = 0;

  function readAccentColor(): string {
    // Canvas2D can't read CSS custom properties itself (sceneRenderer.ts stays pure/parameterized
    // instead of reaching into `document`) — read fresh each redraw so a live theme toggle
    // (16 §5: dark follows the system automatically) is reflected without a page reload.
    return getComputedStyle(container).getPropertyValue('--af-accent').trim() || '#0B6E4F';
  }

  function redraw(): void {
    if (!ctx) return;
    const surface = $activeSurface;
    if (!surface) {
      ctx.clearRect(0, 0, widthCss, heightCss);
      return;
    }
    drawSurface(ctx, surface, $selectedMeasurementId, widthCss, heightCss, readAccentColor());
  }

  function resizeToContainer(): void {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    widthCss = rect.width;
    heightCss = rect.height;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  function onClick(event: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    selectMeasurementAt({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  }

  // Svelte 4 reactive statement: renderSignal's assignment is what declares $activeSurface/
  // $selectedMeasurementId as dependencies (a plain comma-expression would need an eslint
  // exception for an "unused" expression; an assignment doesn't).
  $: renderSignal = { surface: $activeSurface, selection: $selectedMeasurementId };
  $: if (ctx && renderSignal) redraw();

  onMount(() => {
    resizeToContainer();
    resizeObserver = new ResizeObserver(() => resizeToContainer());
    resizeObserver.observe(container);

    // Found via live browser verification: readAccentColor() reads fresh on every redraw, but
    // nothing was actually *triggering* a redraw when the OS color scheme changed — the reactive
    // statement above only depends on surface/selection, not theme. Without this listener the
    // canvas silently kept drawing the old theme's accent until the next unrelated redraw.
    darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    darkSchemeQuery.addEventListener('change', redraw);
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    darkSchemeQuery?.removeEventListener('change', redraw);
  });
</script>

<div class="canvas-stage" bind:this={container} data-testid="canvas-stage">
  <canvas bind:this={canvas} on:click={onClick}></canvas>
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
