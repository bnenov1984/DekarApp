<script lang="ts">
  // docs/21_ARCHITECTURE.md §6 — CanvasStage mounts the Canvas2D scene and never owns geometry
  // (ADR-002); actual draw calls live in rendering/sceneRenderer.ts (a pure, testable module),
  // this component only wires DPI-aware sizing + redraw triggers + click hit-testing to it.
  //
  // Surface space == CSS-pixel canvas space for now (no pan/zoom/calibration-to-screen mapping
  // yet — that's a disclosed, later concern; nothing in 21 §6 requires it to exist before shapes
  // can render and be selected).
  import { onDestroy, onMount, tick } from 'svelte';
  import { activeSurface, selectedMeasurementId, selectMeasurementAt } from '../stores/studioSession.js';
  import {
    activeTool,
    cursorSurfacePoint,
    drawingDraft,
    pointerDown,
    pointerMove,
    pointerUp,
    handleEnter,
    snapTarget,
  } from '../stores/drawingSession.js';
  import {
    calibrating,
    calibrationDraft,
    calibrationCursor,
    calibrationSnapTarget,
    pointerDown as calibrationPointerDown,
    pointerMove as calibrationPointerMove,
    commitCalibration,
    cancelCalibration,
    type CalibrationUnit,
  } from '../stores/calibrationSession.js';
  import { drawSurface, drawInProgress, drawCalibrationLine } from '../rendering/sceneRenderer.js';
  import { shapeCentroid } from '../../core/drawing/centroid.js';
  import { computeMeasurementDisplay } from '../measurement/computeDisplay.js';
  import type { Point, Shape } from '../../core/domain/types.js';
  import type { DrawingDraft } from '../stores/drawingSession.js';
  import MeasurementChip from './MeasurementChip.svelte';
  import ToolDock from './ToolDock.svelte';

  interface ChipData {
    readonly id: string;
    readonly name: string;
    readonly primaryLabel: string;
    readonly x: number;
    readonly y: number;
    readonly selected: boolean;
  }

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
    drawInProgress(ctx, $drawingDraft, $cursorSurfacePoint, $snapTarget, readAccentColor());
    if ($calibrationDraft) {
      drawCalibrationLine(ctx, $calibrationDraft.from, $calibrationDraft.to ?? $calibrationCursor, readAccentColor());
    }
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

  function toSurfacePoint(event: MouseEvent): Point {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  // Click-to-select (21 §6.3) only applies to the Select tool, and never while calibrating (Tool
  // Dock is disabled then too, ToolDock.svelte) — with a drawing tool armed, mousedown/mousemove/
  // mouseup below own the interaction (docs/18_DRAWING_ENGINE.md).
  function onClick(event: MouseEvent): void {
    if ($calibrating || $activeTool !== 'select') return;
    selectMeasurementAt(toSurfacePoint(event));
  }

  function onMouseDown(event: MouseEvent): void {
    const modifiers = { shiftKey: event.shiftKey, altKey: event.altKey };
    if ($calibrating) {
      calibrationPointerDown(toSurfacePoint(event), modifiers);
      return;
    }
    if ($activeTool === 'select') return;
    pointerDown(toSurfacePoint(event), modifiers);
  }

  function onMouseMove(event: MouseEvent): void {
    const modifiers = { shiftKey: event.shiftKey, altKey: event.altKey };
    if ($calibrating) {
      calibrationPointerMove(toSurfacePoint(event), modifiers);
      return;
    }
    if ($activeTool === 'select') return;
    pointerMove(toSurfacePoint(event), modifiers);
  }

  function onMouseUp(event: MouseEvent): void {
    if ($calibrating) return; // calibration is click-click (pointerDown only), no drag semantics
    if ($activeTool === 'select') return;
    pointerUp(toSurfacePoint(event), { shiftKey: event.shiftKey, altKey: event.altKey });
  }

  // 15 §14.4 "Двоен клик" / §5 F1 step 6 — double-click closes a Polygon regardless of self-snap
  // proximity to the first vertex.
  function onDblClick(): void {
    if ($activeTool === 'polygon') handleEnter();
  }

  // Svelte 4 reactive statement: renderSignal's assignment is what declares $activeSurface/
  // $selectedMeasurementId as dependencies (a plain comma-expression would need an eslint
  // exception for an "unused" expression; an assignment doesn't).
  $: renderSignal = {
    surface: $activeSurface,
    selection: $selectedMeasurementId,
    draft: $drawingDraft,
    cursor: $cursorSurfacePoint,
    snap: $snapTarget,
    calibrationDraft: $calibrationDraft,
    calibrationCursor: $calibrationCursor,
    calibrationSnap: $calibrationSnapTarget,
  };
  $: if (ctx && renderSignal) redraw();

  // Live numeric feedback while drawing (15 §5 F1 step 5/§14.2) — built from a synthetic Shape
  // that never goes through drawingEngine.create() (only commit does, drawingSession.ts); this is
  // display-only, same computeMeasurementDisplay used for committed Measurements.
  function previewShape(draft: DrawingDraft | null, cursor: Point | null): Shape | null {
    if (!draft) return null;

    if (draft.kind === 'drag') {
      if (draft.tool === 'rectangle') {
        const width = Math.abs(draft.current.x - draft.origin.x);
        const height = Math.abs(draft.current.y - draft.origin.y);
        if (width <= 0 || height <= 0) return null;
        return {
          type: 'rectangle',
          origin: { x: Math.min(draft.origin.x, draft.current.x), y: Math.min(draft.origin.y, draft.current.y) },
          width,
          height,
          rotation: 0,
        };
      }
      const radius = Math.hypot(draft.current.x - draft.origin.x, draft.current.y - draft.origin.y);
      if (radius <= 0) return null;
      return { type: 'circle', center: draft.origin, radius };
    }

    const points = cursor ? [...draft.points, cursor] : draft.points;
    if (draft.tool === 'line') {
      if (points.length < 2) return null;
      return { type: 'line', from: points[0]!, to: points[1]! };
    }
    if (draft.tool === 'polygon') {
      if (points.length < 3) return null;
      return { type: 'polygon', vertices: points };
    }
    if (points.length < 2) return null;
    return { type: 'freehand', points, closed: false };
  }

  $: previewShapeValue = previewShape($drawingDraft, $cursorSurfacePoint);
  $: previewLabel = previewShapeValue
    ? computeMeasurementDisplay(previewShapeValue, $activeSurface?.calibration ?? null).primaryLabel
    : '';
  $: previewLabelPos = $drawingDraft?.kind === 'drag' ? $drawingDraft.current : $cursorSurfacePoint;

  // 15 W3 — "This line is [value] [unit▾] ⏎ Set scale", anchored to the placed line's midpoint
  // rather than W3's fixed banner position (CalibrationBar.svelte only carries the
  // instruction/Redraw/Cancel row — see that file's header for why).
  let calibrationValue = '';
  let calibrationUnit: CalibrationUnit = 'm';
  let calibrationInputEl: HTMLInputElement | undefined;

  $: calibrationInputPos = $calibrationDraft?.to
    ? { x: (($calibrationDraft.from.x + $calibrationDraft.to.x) / 2), y: (($calibrationDraft.from.y + $calibrationDraft.to.y) / 2) }
    : null;

  // Focus the field the instant it appears (a11y lint disallows the `autofocus` attribute — this
  // is the manual equivalent, triggered by the user's own two-click action, same "focus follows
  // the action just taken" category as an opened dialog's first field).
  $: if (calibrationInputPos) {
    tick().then(() => calibrationInputEl?.focus());
  }

  function submitCalibration(): void {
    const value = Number.parseFloat(calibrationValue);
    if (!(value > 0)) return;
    commitCalibration(value, calibrationUnit, widthCss, heightCss);
    calibrationValue = '';
  }

  function onCalibrationInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitCalibration();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelCalibration();
      calibrationValue = '';
    }
  }

  $: if (!calibrationInputPos) calibrationValue = '';

  // Chips are a DOM projection of the same Measurement data the canvas draws (21 §6.3 "one
  // source, two projections" — never a second, divergent model). Surface-space == CSS-pixel
  // space today, so centroid coordinates are used directly as chip positions.
  $: chips = ($activeSurface?.layers.flatMap((layer) => layer.measurements) ?? []).map(
    (measurement): ChipData => {
      const { x, y } = shapeCentroid(measurement.shape);
      const { primaryLabel } = computeMeasurementDisplay(measurement.shape, $activeSurface!.calibration);
      return {
        id: measurement.id,
        name: measurement.identity.name,
        primaryLabel,
        x,
        y,
        selected: measurement.id === $selectedMeasurementId,
      };
    },
  );

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

<div class="canvas-stage" class:drawing={$activeTool !== 'select'} bind:this={container} data-testid="canvas-stage">
  <canvas
    bind:this={canvas}
    on:click={onClick}
    on:mousedown={onMouseDown}
    on:mousemove={onMouseMove}
    on:mouseup={onMouseUp}
    on:dblclick={onDblClick}
  ></canvas>
  {#each chips as chip (chip.id)}
    <MeasurementChip name={chip.name} primaryLabel={chip.primaryLabel} x={chip.x} y={chip.y} selected={chip.selected} />
  {/each}
  {#if previewLabel && previewLabelPos}
    <div class="draft-label" style="left: {previewLabelPos.x}px; top: {previewLabelPos.y}px;" data-testid="draft-label">
      {previewLabel}
    </div>
  {/if}
  {#if calibrationInputPos}
    <form
      class="calibration-input"
      style="left: {calibrationInputPos.x}px; top: {calibrationInputPos.y}px;"
      data-testid="calibration-input"
      on:submit|preventDefault={submitCalibration}
    >
      <span class="calibration-input-label">This line is</span>
      <input
        type="number"
        min="0"
        step="any"
        bind:this={calibrationInputEl}
        bind:value={calibrationValue}
        on:keydown={onCalibrationInputKeydown}
        data-testid="calibration-value"
      />
      <select bind:value={calibrationUnit} data-testid="calibration-unit">
        <option value="m">m</option>
        <option value="ft">ft</option>
      </select>
      <button type="submit" data-testid="calibration-set-scale">⏎ Set scale</button>
    </form>
  {/if}
  <ToolDock />
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

  .canvas-stage.drawing canvas {
    cursor: crosshair;
  }

  canvas {
    display: block;
  }

  .draft-label {
    position: absolute;
    transform: translate(12px, -50%);
    pointer-events: none;
    background: var(--af-surface-panel);
    border: 1px dashed var(--af-accent);
    border-radius: var(--af-radius-sm);
    padding: 3px 7px;
    font-size: 12.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--af-accent);
    white-space: nowrap;
  }

  .calibration-input {
    position: absolute;
    transform: translate(-50%, 14px);
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--af-surface-raised);
    border-radius: var(--af-radius-sm);
    box-shadow: var(--af-shadow-e2);
    padding: 6px 8px;
    white-space: nowrap;
  }

  .calibration-input-label {
    font-size: 12px;
    color: var(--af-ink-secondary);
  }

  .calibration-input input {
    width: 64px;
    font: inherit;
    font-variant-numeric: tabular-nums;
    padding: 3px 6px;
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-sm);
    background: var(--af-surface-panel);
    color: var(--af-ink-primary);
  }

  .calibration-input select {
    font: inherit;
    padding: 3px 4px;
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-sm);
    background: var(--af-surface-panel);
    color: var(--af-ink-primary);
  }

  .calibration-input button {
    font-size: 12px;
    font-weight: 600;
    color: var(--af-accent-ink);
    background: var(--af-accent);
    border: none;
    border-radius: var(--af-radius-sm);
    padding: 4px 8px;
    cursor: pointer;
  }
</style>
