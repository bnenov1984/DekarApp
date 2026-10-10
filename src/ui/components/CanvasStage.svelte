<script lang="ts">
  // docs/21_ARCHITECTURE.md §6 — CanvasStage mounts the Canvas2D scene and never owns geometry
  // (ADR-002); actual draw calls live in rendering/sceneRenderer.ts (a pure, testable module),
  // this component only wires DPI-aware sizing + redraw triggers + click hit-testing to it.
  //
  // Surface space is NOT CSS-pixel canvas space (it was, before pan/zoom existed — ISS-010). The
  // mapping is `viewport/viewport.ts` (`screen = world * scale + offset`), applied to both canvases
  // by `applyCtxTransform` and inverted by `screenToWorld` for pointer input. Anything that must
  // keep a constant *screen* size while the viewport zooms — a handle radius, a hit tolerance —
  // divides its screen-pixel constant by `$viewport.scale` rather than assuming the two spaces are
  // the same; anything anchored in the scene (shape geometry, the background image's rect) stays in
  // Surface space and is never re-derived from the container's size.
  import { onDestroy, onMount, tick } from 'svelte';
  import {
    activeSurface,
    selectedMeasurementIds,
    selectedMeasurementId,
    findMeasurementAt,
    selectMeasurement,
    toggleMeasurementSelection,
    backgroundSelected,
    selectBackground,
    deselectAll,
    flashBackgroundLock,
    executeCommand,
    setLabelOffset,
  } from '../stores/studioSession.js';
  import { updateIdentityCommand } from '../../application/commands/updateIdentity.js';
  import { openContextMenu } from '../contextMenu/contextMenuSession.js';
  import { buildMeasurementContextMenuItems, buildBackgroundContextMenuItems } from '../contextMenu/measurementMenuItems.js';
  import { backgroundImage } from '../stores/imageAssetSession.js';
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
  import {
    vertexDrag,
    cancelDrag,
    pointerDown as vertexPointerDown,
    deleteVertexAt,
    pointerMove as vertexPointerMove,
    pointerUp as vertexPointerUp,
  } from '../stores/vertexEditSession.js';
  import {
    splittingId,
    splitLinePoints,
    splitCursor,
    pointerDown as splitPointerDown,
    pointerMove as splitPointerMove,
    cancelSplit,
  } from '../stores/splitSession.js';
  import {
    effectiveImageRect,
    imageResizeDrag,
    pointInRect,
    pointerDown as imageResizePointerDown,
    pointerMove as imageResizePointerMove,
    pointerUp as imageResizePointerUp,
    type ImageRect,
  } from '../stores/imageResizeSession.js';
  import { activateVertexLabel, clearActiveVertexLabel } from '../stores/vertexLabelSession.js';
  import {
    labelDrag,
    pointerDown as labelDragPointerDown,
    pointerMove as labelDragPointerMove,
    pointerUp as labelDragPointerUp,
    cancelDrag as cancelLabelDrag,
  } from '../stores/labelDragSession.js';
  import {
    viewport,
    zoomWheel,
    resetZoomAt,
    fitToContentRequested,
    panDrag,
    startPan,
    panTo,
    endPan,
  } from '../stores/viewportSession.js';
  import { displayUnit } from '../stores/unitPreferenceSession.js';
  import { screenToWorld, worldToScreen, fitBounds } from '../viewport/viewport.js';
  import { exceedsDragThreshold } from '../interaction/dragThreshold.js';
  import { canSplit, split } from '../../core/drawing/split.js';
  import { findHandleIndexAt } from '../../core/drawing/hitTest.js';
  import { shapeBounds, unionBounds, type Bounds } from '../../core/drawing/bounds.js';
  import {
    drawSurface,
    drawInProgress,
    drawCalibrationLine,
    drawVertexHandles,
    drawVertexEditPreview,
    drawLinkedVertexPreview,
    drawSelectionOutline,
    drawSplitPreview,
    drawBackgroundImage,
    resizeHandlePoints,
    type ContainRect,
  } from '../rendering/sceneRenderer.js';
  import { shapeCentroid } from '../../core/drawing/centroid.js';
  import { computeMeasurementDisplay, applyManualArea } from '../measurement/computeDisplay.js';
  import type { Point, PolygonShape, Shape } from '../../core/domain/types.js';
  import type { MeasurementId } from '../../core/domain/entities.js';
  import type { DrawingDraft } from '../stores/drawingSession.js';
  import MeasurementChip from './MeasurementChip.svelte';
  import ScaleBar from './ScaleBar.svelte';
  import ToolDock from './ToolDock.svelte';

  interface ChipData {
    readonly id: string;
    readonly name: string;
    readonly primaryLabel: string;
    readonly x: number;
    readonly y: number;
    readonly selected: boolean;
    // PO request (draggable polygon labels) — Polygon chips only; `centroid` is the world-space
    // anchor labelDragSession.ts measures its delta from (needed at drag-start, screen space
    // alone isn't enough once zoom/pan is involved).
    readonly draggable: boolean;
    readonly centroid: Point;
  }

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let backgroundCanvas: HTMLCanvasElement;
  let resizeObserver: ResizeObserver;
  let darkSchemeQuery: MediaQueryList;
  let ctx: CanvasRenderingContext2D | null = null;
  let backgroundCtx: CanvasRenderingContext2D | null = null;
  let widthCss = 0;
  let heightCss = 0;
  let dpr = 1; // cached from resizeToContainer — re-applied on every viewport (zoom/pan) change too
  // A mousedown that starts an image-resize drag (imageResizeSession.ts) is followed by the
  // browser's own synthetic 'click' event on mouseup, same target — without this, that click
  // would fall through to onClick's selection logic below and re-decide the click as a plain
  // select/deselect, exactly the kind of miss-click regression the double-click fix above already
  // had to correct.
  let suppressNextClick = false;

  function toRectangleShape(rect: ImageRect): Shape {
    return { type: 'rectangle', origin: rect.origin, width: rect.width, height: rect.height, rotation: 0 };
  }

  function readAccentColor(): string {
    // Canvas2D can't read CSS custom properties itself (sceneRenderer.ts stays pure/parameterized
    // instead of reaching into `document`) — read fresh each redraw so a live theme toggle
    // (16 §5: dark follows the system automatically) is reflected without a page reload.
    return getComputedStyle(container).getPropertyValue('--af-accent').trim() || '#0B6E4F';
  }

  // PO request: resizable/movable/lockable imported image. Only meaningful once the bitmap has
  // actually decoded (imageAssetSession.ts) — before that there's nothing to hit-test or draw
  // handles for. `undefined`/`true` both mean locked (the safe default — entities.ts).
  $: currentImageRect =
    $activeSurface?.kind === 'image' && $backgroundImage
      ? effectiveImageRect($activeSurface, $backgroundImage.width, $backgroundImage.height)
      : null;
  $: imageAspectRatio = $backgroundImage ? $backgroundImage.width / $backgroundImage.height : 1;

  // PO request (zoom % indicator) — "reflect the true renderer viewport scale... do not maintain
  // a duplicate independent UI value": this is a plain derived read of $viewport, never its own
  // stored number.
  $: zoomPercent = Math.round($viewport.scale * 100);

  function onZoomIndicatorClick(): void {
    resetZoomAt({ x: widthCss / 2, y: heightCss / 2 });
  }

  // PO follow-up (UX review, item B8 "zoom-to-fit") — union of every Measurement's bounds plus
  // the background image's current rect (if any); `null` when there's nothing to fit (a blank,
  // still-empty canvas — same "nothing to do" no-op every other content-dependent action here
  // already has, e.g. deleteSelectedMeasurement with no selection).
  $: contentBounds = ((): Bounds | null => {
    const measurementBounds = ($activeSurface?.layers.flatMap((l) => l.measurements) ?? [])
      .map((m) => shapeBounds(m.shape))
      .filter((b): b is Bounds => b !== null);
    const imageBounds: Bounds | null = currentImageRect
      ? {
          minX: currentImageRect.origin.x,
          minY: currentImageRect.origin.y,
          maxX: currentImageRect.origin.x + currentImageRect.width,
          maxY: currentImageRect.origin.y + currentImageRect.height,
        }
      : null;
    const all = imageBounds ? [...measurementBounds, imageBounds] : measurementBounds;
    return all.length > 0 ? all.reduce(unionBounds) : null;
  })();

  const FIT_PADDING_PX = 48;

  function fitToContent(): void {
    if (!contentBounds) return;
    viewport.set(fitBounds(contentBounds, widthCss, heightCss, FIT_PADDING_PX));
  }

  $: if ($fitToContentRequested) fitToContent();

  // ISS-010 fix: `effectiveImageRect`'s default is now the image's fixed native-bitmap-size
  // Surface-space rect (imageResizeSession.ts), no longer re-derived from the live container box
  // size on every resize — so nothing else brings a freshly imported, possibly multi-megapixel
  // image into view at a sensible zoom. Fit once per newly-decoded bitmap (identity-guarded, same
  // "once per change, not every redraw" shape as AccountMenu.svelte's `lastRefreshedFor`) rather
  // than on every resize, which would fight the user's own subsequent pan/zoom.
  let lastFitBitmap: ImageBitmap | null = null;
  $: if ($backgroundImage && $backgroundImage !== lastFitBitmap && widthCss > 0 && heightCss > 0) {
    lastFitBitmap = $backgroundImage;
    fitToContent();
  }
  // PO follow-up (UX review, item B4 "empty-canvas ghost hint") — a first-time "Blank canvas"
  // session drops the user into a silent, totally empty stage with nothing communicating "pick a
  // tool below and draw" (the 5-second first-impression test failed here in the review). Gated on
  // "zero measurements" rather than a one-time first-visit flag — if the user later deletes
  // everything, the same guidance is exactly as relevant again, so it just naturally reappears.
  $: hasAnyMeasurements = ($activeSurface?.layers.flatMap((l) => l.measurements) ?? []).length > 0;
  $: showEmptyCanvasHint = !hasAnyMeasurements && !$drawingDraft && !$calibrating && !$splittingId;

  $: imageLocked = $activeSurface?.imageLocked ?? true;
  // PO follow-up (background layer selectability) — handles only show once the Background layer
  // is actually selected (`$backgroundSelected`), same "select it to see its handles" model as
  // every other selectable layer, rather than appearing merely because the image is unlocked.
  // PO follow-up ("neutral interaction state") — background resize/move is a neutral-state
  // affordance (like Measurement selection/drag); Pan (now a real, explicit, drag-absorbing tool,
  // not the idle default) has no special carve-out here — a drag over the background while Pan is
  // active just pans, per its own absolute-priority handling in onMouseDown below.
  $: canResizeImage =
    $activeTool === null && !$calibrating && !$splittingId && !imageLocked && $backgroundSelected && currentImageRect;

  /** `drawSurface`/`drawBackgroundImage` (sceneRenderer.ts) each clear via
   * `ctx.clearRect(0, 0, widthCss, heightCss)` in *current-transform* space — correct when the
   * transform was just plain DPR, but once a zoom/pan viewport is applied on top (PO request,
   * `applyCtxTransform`), that same call only clears a `scale`-sized fraction of the canvas at
   * zoom-out (`scale < 1`), leaving stale pixels at the edges. Clearing here first, in a
   * temporarily-reset identity transform against the actual backing-buffer size, fixes that;
   * sceneRenderer's own clearRect then just re-clears an already-empty area (harmless). */
  function clearFullCanvas(c: CanvasRenderingContext2D): void {
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    c.restore();
  }

  function redraw(): void {
    if (!ctx) return;
    applyCtxTransform(); // re-applied on every redraw so a zoom/pan change is never one frame stale
    clearFullCanvas(ctx);
    const surface = $activeSurface;
    if (!surface) return;
    drawSurface(ctx, surface, $selectedMeasurementIds, widthCss, heightCss, readAccentColor());
    drawInProgress(ctx, $drawingDraft, $cursorSurfacePoint, $snapTarget, readAccentColor());
    if ($calibrationDraft) {
      drawCalibrationLine(ctx, $calibrationDraft.from, $calibrationDraft.to ?? $calibrationCursor, readAccentColor());
    }
    // PO follow-up ("unify object selection and edit state") — a single-selected, unlocked shape
    // always gets handles now (no separate "vertex-editing" mode to enter first); a locked
    // selection already gets its outline for free from `drawSurface`'s own `selected` treatment
    // above, so it deliberately gets no handles here (entities.ts's `locked` contract — a locked
    // shape isn't draggable, so implying otherwise with handles would be misleading).
    if ($selectedMeasurementId) {
      const editing = surface.layers.flatMap((l) => l.measurements).find((m) => m.id === $selectedMeasurementId);
      if (editing && !editing.locked) {
        if ($vertexDrag) {
          if ($vertexDrag.kind === 'vertex' || $vertexDrag.kind === 'edge') {
            for (const linked of $vertexDrag.linkedPreviews) drawLinkedVertexPreview(ctx, linked.previewShape, readAccentColor());
          }
          drawVertexEditPreview(ctx, $vertexDrag.previewShape, readAccentColor(), $viewport.scale);
        } else {
          drawVertexHandles(ctx, editing.shape, readAccentColor(), $viewport.scale);
        }
      }
    }
    if ($splittingId) {
      const splitLine = $splitCursor ? [...$splitLinePoints, $splitCursor] : $splitLinePoints;
      const splitting = surface.layers.flatMap((l) => l.measurements).find((m) => m.id === $splittingId);
      const shape = splitting && splitting.shape.type === 'polygon' ? splitting.shape : null;
      const result = shape && splitLine.length >= 2 && canSplit(shape, splitLine) ? split(shape, splitLine) : null;
      drawSplitPreview(ctx, splitLine, result?.ok ? result.value : null, readAccentColor());
    }
    if (canResizeImage) {
      if ($imageResizeDrag) {
        drawVertexEditPreview(ctx, toRectangleShape($imageResizeDrag), readAccentColor(), $viewport.scale);
      } else if (currentImageRect) {
        drawVertexHandles(ctx, toRectangleShape(currentImageRect), readAccentColor(), $viewport.scale);
      }
    } else if ($backgroundSelected && currentImageRect) {
      // Selected but not (yet) interactive — locked, or a drawing/calibration/vertex-edit/split
      // session is active — a plain outline still confirms "this is the selected layer" without
      // implying it can be dragged (canResizeImage's own handles cover that case above).
      drawSelectionOutline(ctx, toRectangleShape(currentImageRect), readAccentColor());
    }
  }

  /** ADR-002's raster half — its own canvas, sized identically to the vector one but repainted
   * only here (resize) and from the `$backgroundImage` reactive block below, never on every
   * mouse move like `redraw()` is. */
  function toContainRect(rect: ImageRect): ContainRect {
    return { x: rect.origin.x, y: rect.origin.y, width: rect.width, height: rect.height };
  }

  function redrawBackground(): void {
    if (!backgroundCtx) return;
    applyCtxTransform();
    clearFullCanvas(backgroundCtx);
    if ($backgroundImage) {
      const rect = $imageResizeDrag ?? currentImageRect;
      drawBackgroundImage(backgroundCtx, $backgroundImage, widthCss, heightCss, rect ? toContainRect(rect) : undefined);
    }
  }

  /** PO request (canvas zoom) — applies devicePixelRatio *and* the current pan/zoom viewport in
   * one `setTransform` call, which is what makes zoom automatically affect every draw call in
   * both contexts (background image, shapes, vertices, overlays, selection, calibration visuals —
   * ADR-002's two layers, sceneRenderer.ts) without those draw functions needing to know the
   * viewport exists at all: they still just draw at raw world/Surface coordinates. */
  function applyCtxTransform(): void {
    const { scale, offsetX, offsetY } = $viewport;
    backgroundCtx?.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
    ctx?.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
  }

  function resizeToContainer(): void {
    const rect = container.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    widthCss = rect.width;
    heightCss = rect.height;

    for (const c of [canvas, backgroundCanvas]) {
      c.width = Math.max(1, Math.round(rect.width * dpr));
      c.height = Math.max(1, Math.round(rect.height * dpr));
      c.style.width = `${rect.width}px`;
      c.style.height = `${rect.height}px`;
    }

    ctx = canvas.getContext('2d');
    backgroundCtx = backgroundCanvas.getContext('2d');
    applyCtxTransform();
    redrawBackground();
    if (!ctx) return;
    redraw();
  }

  /** Surface/world space (18 §3) — the inverse of `applyCtxTransform`'s screen<->world mapping
   * (viewport.ts's `screenToWorld`), so hit-testing/drawing-input always agree with whatever the
   * canvas is currently showing at any zoom/pan level. */
  function toSurfacePoint(event: MouseEvent): Point {
    const rect = canvas.getBoundingClientRect();
    return screenToWorld($viewport, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  }

  // PO follow-up (UX review, item A2 "pan") + PO follow-up ("replace Select tool with Pan") —
  // three ways to pan, all funneling into the one shared controller (viewportSession.ts's
  // startPan/panTo/endPan, `$panDrag`): holding Space (Figma/Photoshop convention), the middle
  // mouse button (works regardless of active tool), or the explicit Pan tool itself. Space-key
  // detection stays local here (pure event plumbing, not pan math — viewportSession has no reason
  // to know a keyboard key is involved).
  let spacePanning = false;

  function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT' || el?.isContentEditable === true;
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    // A focused button (e.g. a ToolDock slot) must keep Space's standard "activate this button"
    // behavior — temporary pan is a canvas/workspace-context override, not a global Space hijack.
    if (event.code !== 'Space' || isTypingTarget(event.target) || (event.target as HTMLElement | null)?.tagName === 'BUTTON' || spacePanning) {
      return;
    }
    event.preventDefault(); // Space's default is page-scroll; this canvas has no scroll of its own
    spacePanning = true;
  }

  function onWindowKeyup(event: KeyboardEvent): void {
    if (event.code === 'Space') spacePanning = false;
  }

  function isPanTrigger(event: MouseEvent): boolean {
    return event.button === 1 || (event.button === 0 && spacePanning);
  }

  // Space/middle-button pan is a deliberate override gesture — the trailing 'click' is always
  // suppressed regardless of how far the pointer actually moved (a plain middle-click's release
  // fires 'auxclick', never 'click', so this is a no-op there anyway). The explicit Pan *tool*'s
  // own empty-canvas drag (onMouseDown below) is threshold-gated instead, since it's the same
  // gesture a plain deselect-click uses and must still let a no-movement click deselect.
  function startOverridePan(event: MouseEvent): void {
    event.preventDefault(); // middle-click's default is often OS/browser autoscroll
    startPan(event.clientX, event.clientY);
    suppressNextClick = true;
  }

  // PO follow-up ("unify object selection and edit state") — a mousedown that hits an already-
  // selectable Measurement selects it immediately (not on click/mouseup) so the same gesture can
  // continue into a drag without a separate "enter edit mode" step; `started` flips once the
  // pointer has actually moved past dragThreshold.ts's shared threshold, at which point the real
  // vertexEditSession drag begins. Deliberately baselined at `startSurfacePoint` — the *original*
  // mousedown position, not wherever the pointer happened to be once it crossed the threshold —
  // since `vertexPointerDown` does its own corner/vertex/edge hit-testing with a small (8 world-
  // unit) tolerance: by the time the pointer has moved past even a few screen pixels, it can
  // already be well outside a corner handle's own hit radius, misclassifying a corner-resize as a
  // whole-shape move (or missing the shape entirely). The immediately-following `vertexPointerMove`
  // call to the *current* point (onMouseMove below) still updates the preview to track the mouse
  // right away, so there's no lag — only the initial "which part did you grab" decision uses the
  // original point.
  let pendingShapeDrag: {
    readonly measurementId: MeasurementId;
    readonly startClientX: number;
    readonly startClientY: number;
    readonly startSurfacePoint: Point;
    /** Selected before this mousedown, so its handles were visible — a still Alt+click only
     * deletes a vertex the user could see (onMouseUp). */
    readonly wasSelected: boolean;
    started: boolean;
  } | null = null;

  // A Pan-tool drag that starts on truly empty canvas (missed every Measurement and the
  // background) is tracked separately from the Space/middle-button override above specifically so
  // its trailing click can still deselect when the pointer never actually moved (see onMouseUp) —
  // a plain click with Pan active must behave like a plain click, not like a deliberate pan gesture.
  let emptyCanvasPanStart: { readonly clientX: number; readonly clientY: number } | null = null;

  // Hit-test tolerances are authored in *screen* pixels (the felt click-target size should stay
  // constant regardless of zoom) but every hit-test function takes a *world*-space tolerance
  // (18/21 — Surface-space is the only space Core geometry knows about) — dividing by scale here
  // is the conversion. Known, disclosed scope line: vertexEditSession.ts/imageResizeSession.ts's
  // own *internal* drag-start hit-tests (vertex/edge/corner grab, image-resize handles) keep their
  // own fixed-world-unit constants for this slice — only the two tolerances CanvasStage directly
  // owns (plain click-to-select, and the vertex-label-activation handle hit-test) are made
  // scale-aware here.
  const SELECT_HIT_TOLERANCE_SCREEN_PX = 4;
  const HANDLE_HIT_TOLERANCE_SCREEN_PX = 8;
  $: selectHitTolerance = SELECT_HIT_TOLERANCE_SCREEN_PX / $viewport.scale;
  $: handleHitTolerance = HANDLE_HIT_TOLERANCE_SCREEN_PX / $viewport.scale;

  // PO follow-up ("unify object selection and edit state" / "neutral interaction state") —
  // selection is a direct canvas interaction belonging to the neutral state (`activeTool ===
  // null`) — no "Select tool" to activate first, but also not available while a drawing tool or
  // the explicit Pan tool owns the interaction instead. A hit is handled at mousedown time below
  // (so the same gesture can continue straight into a drag), which is why `onClick` only ever
  // needs to handle the miss case by the time it runs (the hit branch already ran, and set
  // `suppressNextClick`, before `click` even fires). A miss that still lands within the
  // background image's bounds selects the Background layer (flashing the Layers panel's lock icon
  // first if it's locked, so a click that visibly "did nothing" still explains itself); a true
  // miss deselects both selection channels.
  function onClick(event: MouseEvent): void {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if ($calibrating || $splittingId || $activeTool !== null) return;
    const point = toSurfacePoint(event);
    if (currentImageRect && pointInRect(point, currentImageRect)) {
      if (imageLocked) flashBackgroundLock();
      selectBackground();
      return;
    }
    deselectAll();
  }

  function onMouseDown(event: MouseEvent): void {
    // PO request (draggable polygon labels) — defensive guard, same style as the $labelDrag check
    // in onMouseMove; a chip's own mousedown already stops propagation before reaching here, so
    // this only matters if a drag were somehow still live from a prior gesture.
    if ($labelDrag) return;
    if (isPanTrigger(event)) {
      startOverridePan(event);
      return;
    }
    const modifiers = { shiftKey: event.shiftKey, altKey: event.altKey };
    if ($calibrating) {
      calibrationPointerDown(toSurfacePoint(event), modifiers);
      return;
    }
    if ($splittingId) {
      splitPointerDown(toSurfacePoint(event));
      return;
    }

    if ($activeTool === 'pan') {
      // PO follow-up ("no hybrid or context-sensitive Pan behaviour") — explicit Pan has absolute
      // interaction priority: every drag pans, uniformly, regardless of what it starts over
      // (shape/handle/background/empty canvas) — no branching on hit-target here, unlike the
      // neutral-state block below. A plain click (no movement) is still handled by `onClick`, but
      // that only ever fires in the neutral state (`$activeTool === null`), so a click while Pan
      // is explicitly active does nothing at all — selection is a neutral-state affordance.
      startPan(event.clientX, event.clientY);
      emptyCanvasPanStart = { clientX: event.clientX, clientY: event.clientY };
      return;
    }

    if ($activeTool !== null) {
      // a drawing tool is armed — it always creates/continues geometry, never selects (an
      // in-progress shape must never be unexpectedly interrupted by a click meant to select
      // something else underneath it).
      pointerDown(toSurfacePoint(event), modifiers);
      return;
    }

    // Neutral interaction state — direct selection + drag-to-edit.
    const point = toSurfacePoint(event);
    const hitId = $activeSurface ? findMeasurementAt($activeSurface, point, selectHitTolerance) : null;

    if (hitId) {
      // PO follow-up ("unify object selection and edit state") — select immediately at mousedown
      // (not on click/mouseup) so "click an unselected shape and drag it" is one coherent gesture;
      // `pendingShapeDrag` below decides, once the pointer actually moves past the shared
      // threshold, whether a real drag (move/resize/vertex-edit) starts. Shift-clicking an already-
      // selected shape OUT of a multi-selection must not then let a drag move it — only arm
      // `pendingShapeDrag` when the shape ends up selected after this mousedown.
      const wasSelected = $selectedMeasurementIds.has(hitId);
      let nowSelected: boolean;
      if (event.shiftKey) {
        toggleMeasurementSelection(hitId);
        nowSelected = $selectedMeasurementIds.has(hitId);
      } else {
        selectMeasurement(hitId);
        nowSelected = true;
      }
      if (nowSelected) {
        pendingShapeDrag = {
          measurementId: hitId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startSurfacePoint: point,
          wasSelected,
          started: false,
        };
      }
      suppressNextClick = true;
      return;
    }

    // PO follow-up (background layer selectability) — a resize/move drag can only start once the
    // Background layer is already selected (a plain click, handled by onClick above, is what
    // selects it first) — same two-step "select, then drag its now-visible handles" model every
    // other layer already had before this unification, deliberately preserved as-is (out of scope
    // for the Measurement-selection unification this slice is about).
    if (currentImageRect && $backgroundSelected) {
      if (imageResizePointerDown(point, currentImageRect, imageAspectRatio, imageLocked, false)) {
        suppressNextClick = true;
        return;
      }
    }

    const hitBackground = !!(currentImageRect && pointInRect(point, currentImageRect));
    if (hitBackground) {
      // Not yet selected (or selected but declined the resize drag, e.g. locked) — let onClick
      // select it; no drag starts here.
      return;
    }

    // Truly empty canvas in the neutral state — no drag-worthy action here (the old multi-select
    // marquee is retired, superseded by the explicit Pan tool owning empty-canvas drags instead —
    // known limitation, disclosed). `onClick`'s own deselect-on-miss still fires normally since
    // nothing here sets `suppressNextClick`.
  }

  function onMouseMove(event: MouseEvent): void {
    // PO request (draggable polygon labels) — an active label drag owns the pointer exclusively
    // (mirrors the $panDrag guard right below); its own mousemove handling lives in the
    // <svelte:window> binding, not here.
    if ($labelDrag) return;
    if ($panDrag) {
      panTo(event.clientX, event.clientY);
      return;
    }
    if (pendingShapeDrag) {
      // PD-024 — Ctrl/⌘ at drag start detaches a vertex drag from its neighbours.
      const modifiers = { shiftKey: event.shiftKey, altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey };
      if (!pendingShapeDrag.started) {
        if (!exceedsDragThreshold(pendingShapeDrag.startClientX, pendingShapeDrag.startClientY, event.clientX, event.clientY)) {
          return; // still just a held-down click so far, below the drag threshold
        }
        pendingShapeDrag.started = true;
        // The original mousedown point (see pendingShapeDrag's own comment) — correct
        // corner/vertex/edge hit-testing depends on it. The immediately-following
        // vertexPointerMove call below still updates the preview to the current point, so the
        // shape tracks the mouse right away with no perceptible lag.
        vertexPointerDown(pendingShapeDrag.startSurfacePoint, modifiers, pendingShapeDrag.measurementId);
      }
      vertexPointerMove(toSurfacePoint(event), modifiers);
      return;
    }
    const modifiers = { shiftKey: event.shiftKey, altKey: event.altKey };
    if ($imageResizeDrag) {
      imageResizePointerMove(toSurfacePoint(event));
      return;
    }
    if ($calibrating) {
      calibrationPointerMove(toSurfacePoint(event), modifiers);
      return;
    }
    if ($splittingId) {
      splitPointerMove(toSurfacePoint(event));
      return;
    }
    if ($activeTool === null || $activeTool === 'pan') return;
    pointerMove(toSurfacePoint(event), modifiers);
  }

  function onMouseUp(event: MouseEvent): void {
    if ($panDrag) {
      // Override (Space/middle-button) pans have no `emptyCanvasPanStart` — always suppress,
      // same unconditional reasoning as `startOverridePan`. A Pan-tool empty-canvas pan only
      // suppresses the trailing click if the pointer actually moved past the threshold.
      const wasRealDrag = emptyCanvasPanStart
        ? exceedsDragThreshold(emptyCanvasPanStart.clientX, emptyCanvasPanStart.clientY, event.clientX, event.clientY)
        : true;
      endPan();
      emptyCanvasPanStart = null;
      if (wasRealDrag) suppressNextClick = true;
      return;
    }
    if (pendingShapeDrag) {
      if (pendingShapeDrag.started) {
        vertexPointerUp();
      } else if (event.altKey && pendingShapeDrag.wasSelected) {
        // Alt+click deletes a vertex (15 §13) — a click that never crossed the drag threshold
        // never reached vertexPointerDown, whose Alt branch only covers Alt+drag.
        const modifiers = { shiftKey: event.shiftKey, altKey: true, ctrlKey: event.ctrlKey, metaKey: event.metaKey };
        deleteVertexAt(pendingShapeDrag.startSurfacePoint, modifiers, pendingShapeDrag.measurementId);
      }
      pendingShapeDrag = null;
      return;
    }
    if ($imageResizeDrag) {
      imageResizePointerUp();
      return;
    }
    if ($calibrating) return; // calibration is click-click (pointerDown only), no drag semantics
    if ($splittingId) return; // splitting is click-to-place, no drag
    if ($activeTool === null || $activeTool === 'pan') return;
    pointerUp(toSurfacePoint(event), { shiftKey: event.shiftKey, altKey: event.altKey });
  }

  // Found via live PO testing: an image-resize/move drag that ends with the mouse button
  // released *outside* the canvas element never fires the canvas's own `on:mouseup` (browsers
  // only deliver mouseup to whatever element the pointer is currently over) — the drag was
  // getting stuck active forever, with no way to end it short of another click inside the canvas.
  // This window-level fallback is idempotent with the canvas's own handler above: for a mouseup
  // that *does* land on the canvas, both fire (bubbling), but each handler below is a no-op the
  // second time since the first call already cleared its own drag state.
  function onWindowMouseUp(): void {
    if ($panDrag) {
      endPan();
      emptyCanvasPanStart = null;
    }
    if (pendingShapeDrag) {
      if (pendingShapeDrag.started) vertexPointerUp();
      pendingShapeDrag = null;
    }
    if ($imageResizeDrag) imageResizePointerUp();
    if ($labelDrag) {
      const committed = labelDragPointerUp();
      if (committed) setLabelOffset(committed.measurementId, committed.dx, committed.dy);
    }
  }

  /** PO request (draggable polygon labels) — MeasurementChip's `onDragStart` for a Polygon chip.
   * `chip.centroid` is already known (the same value the chip was positioned with); the
   * containment check itself happens per-move in `onWindowMouseMove` below, against the shape's
   * *current* vertices, so a concurrent edit elsewhere is never checked against stale geometry. */
  function onChipDragStart(chip: ChipData, event: MouseEvent): void {
    const measurement = $activeSurface?.layers.flatMap((l) => l.measurements).find((m) => m.id === chip.id);
    if (!measurement || measurement.shape.type !== 'polygon') return;
    labelDragPointerDown(chip.id, event.clientX, event.clientY, chip.centroid, measurement.labelOffset);
  }

  function onWindowMouseMove(event: MouseEvent): void {
    if (!$labelDrag) return;
    const measurement = $activeSurface?.layers.flatMap((l) => l.measurements).find((m) => m.id === $labelDrag!.measurementId);
    if (!measurement || measurement.shape.type !== 'polygon') return;
    labelDragPointerMove(event.clientX, event.clientY, $viewport.scale, measurement.shape.vertices);
  }

  // 15 §14.4 "Двоен клик" — reserved solely for the per-vertex label workflow now (PO follow-up,
  // "unify object selection and edit state": a single click already selects AND shows handles, so
  // double-click no longer has an "enter edit mode" job to do). Over a Polygon being drawn, still
  // closes it regardless of self-snap proximity (§5 F1 step 6) instead.
  function onDblClick(event: MouseEvent): void {
    if ($calibrating || $splittingId) return;
    if ($activeTool === 'polygon') {
      handleEnter();
      return;
    }
    if ($activeTool !== null) return;
    const surface = $activeSurface;
    if (!surface) return;
    const point = toSurfacePoint(event);

    // PO request (per-vertex annotation) — only reachable on a handle of the single currently-
    // selected shape (handles are only ever drawn for that one, `redraw()` above); a double-click
    // anywhere else on the shape's body (or a miss) is deliberately a no-op — it must not create a
    // second selection mode, and must not prevent a later plain click from deselecting.
    const selectedId = $selectedMeasurementId;
    if (selectedId) {
      const selected = surface.layers.flatMap((l) => l.measurements).find((m) => m.id === selectedId);
      if (selected && !selected.locked) {
        const handleIndex = findHandleIndexAt(point, selected.shape, handleHitTolerance);
        if (handleIndex !== null) activateVertexLabel(selectedId, handleIndex);
      }
    }
  }

  // PO follow-up (UX review, item A14 "no context menus") — right-click on a Measurement selects
  // it first if it wasn't already part of the current selection (so right-clicking one of several
  // already-selected shapes keeps the whole multi-selection, matching every other tool's
  // "right-click within an existing multi-select acts on the group" convention), then opens the
  // shared menu builder's result. Shared with the chip's own right-click (openMeasurementMenuFor)
  // so canvas and chip right-clicks always build the identical menu for the identical id, D8.
  function openMeasurementMenuFor(id: string, event: MouseEvent): void {
    const surface = $activeSurface;
    if (!surface) return;
    if (!$selectedMeasurementIds.has(id)) selectMeasurement(id);
    openContextMenu(event.clientX, event.clientY, buildMeasurementContextMenuItems($selectedMeasurementIds, surface, !!$splittingId));
  }

  // A miss over the background image selects+menus it instead; a miss over truly empty canvas
  // shows nothing (the browser's own menu is also suppressed — there's nothing actionable there
  // without a clipboard).
  function onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    if ($calibrating || $splittingId || $activeTool !== null) return;
    const surface = $activeSurface;
    if (!surface) return;
    const point = toSurfacePoint(event);
    const id = findMeasurementAt(surface, point, selectHitTolerance);
    if (id) {
      openMeasurementMenuFor(id, event);
      return;
    }
    if (currentImageRect && pointInRect(point, currentImageRect)) {
      selectBackground();
      openContextMenu(event.clientX, event.clientY, buildBackgroundContextMenuItems(imageLocked));
    }
  }

  // Deselecting (or switching to a different single selection) always closes any open vertex
  // label editor too — a label session pinned to a vertex index on a shape that's no longer the
  // one thing selected has no business staying open.
  $: if (!$selectedMeasurementId) clearActiveVertexLabel();

  // Svelte 4 reactive statement: renderSignal's assignment is what declares $activeSurface/
  // $selectedMeasurementIds as dependencies (a plain comma-expression would need an eslint
  // exception for an "unused" expression; an assignment doesn't).
  $: renderSignal = {
    viewport: $viewport,
    surface: $activeSurface,
    selection: $selectedMeasurementIds,
    backgroundSelected: $backgroundSelected,
    draft: $drawingDraft,
    cursor: $cursorSurfacePoint,
    snap: $snapTarget,
    calibrationDraft: $calibrationDraft,
    calibrationCursor: $calibrationCursor,
    calibrationSnap: $calibrationSnapTarget,
    vertexDrag: $vertexDrag,
    splittingId: $splittingId,
    splitLinePoints: $splitLinePoints,
    splitCursor: $splitCursor,
    imageRect: currentImageRect,
    imageDrag: $imageResizeDrag,
  };
  $: if (ctx && renderSignal) redraw();
  // Same "assignment declares the dependency" trick as renderSignal above, kept separate since
  // the background only needs to repaint when the image/its rect changes, not on every mouse
  // move that isn't part of an active image-resize drag.
  $: backgroundSignal = { viewport: $viewport, image: $backgroundImage, rect: currentImageRect, drag: $imageResizeDrag };
  $: if (backgroundCtx && backgroundSignal) redrawBackground();

  // Leaving the neutral interaction state (Tool Dock click or keyboard shortcut arming a drawing
  // tool or explicit Pan, both funnel through drawingSession.setTool) cancels any in-progress drag
  // preview / split — avoids stale state silently resuming if the user later returns to neutral
  // without an explicit Esc. Does NOT deselect (selection persists across a tool switch).
  $: if ($activeTool !== null && $vertexDrag) cancelDrag();
  $: if ($activeTool !== null && $splittingId) cancelSplit();
  $: if ($activeTool !== null && $labelDrag) cancelLabelDrag();

  // 15 §5 F7 step 3 — live dual-area ghost labels, one per resulting child, once the split line
  // crosses the parent boundary exactly twice (canSplit). Recomputed here (not read from
  // redraw()'s own inline computation) purely for the floating DOM labels below; the canvas ghost
  // outlines themselves are drawn by drawSplitPreview inside redraw().
  $: splitPreviewChildren = ((): readonly [Shape, Shape] | null => {
    if (!$splittingId || !$activeSurface) return null;
    const splitting = $activeSurface.layers.flatMap((l) => l.measurements).find((m) => m.id === $splittingId);
    const shape = splitting && splitting.shape.type === 'polygon' ? (splitting.shape as PolygonShape) : null;
    if (!shape) return null;
    const line = $splitCursor ? [...$splitLinePoints, $splitCursor] : $splitLinePoints;
    if (line.length < 2 || !canSplit(shape, line)) return null;
    const result = split(shape, line);
    return result.ok ? result.value : null;
  })();

  $: splitLabels = (splitPreviewChildren ?? []).map((child) => {
    const { x, y } = worldToScreen($viewport, shapeCentroid(child));
    const { primaryLabel } = computeMeasurementDisplay(child, $activeSurface?.calibration ?? null, $displayUnit);
    return { x, y, primaryLabel };
  });

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
    ? computeMeasurementDisplay(previewShapeValue, $activeSurface?.calibration ?? null, $displayUnit).primaryLabel
    : '';
  $: previewLabelWorldPos = $drawingDraft?.kind === 'drag' ? $drawingDraft.current : $cursorSurfacePoint;
  $: previewLabelPos = previewLabelWorldPos ? worldToScreen($viewport, previewLabelWorldPos) : null;

  // 15 W3 — "This line is [value] [unit▾] ⏎ Set scale", anchored to the placed line's midpoint
  // rather than W3's fixed banner position (CalibrationBar.svelte only carries the
  // instruction/Redraw/Cancel row — see that file's header for why).
  let calibrationValue = '';
  let calibrationUnit: CalibrationUnit = 'm';
  let calibrationInputEl: HTMLInputElement | undefined;

  $: calibrationInputPos = $calibrationDraft?.to
    ? worldToScreen($viewport, {
        x: ($calibrationDraft.from.x + $calibrationDraft.to.x) / 2,
        y: ($calibrationDraft.from.y + $calibrationDraft.to.y) / 2,
      })
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
  // source, two projections" — never a second, divergent model). Centroid is computed in world
  // space (unchanged) and converted to screen space for the DOM `left`/`top` positioning — the
  // canvas itself doesn't need this conversion (its own ctx transform already does the
  // equivalent for every draw call, applyCtxTransform above), but a plain absolutely-positioned
  // `<div>` isn't inside that transform, so it needs the explicit conversion (PO request, zoom).
  // PO follow-up (UX review, item A5 "eye icon = real visibility") — a hidden Measurement
  // (identity.hidden) has no chip either (drawSurface, sceneRenderer.ts, already skips drawing
  // the shape itself) — toggled per-row by the eye icon in the Layers panel (MeasurementList.svelte).
  $: chips = ($activeSurface?.layers.flatMap((layer) => layer.measurements) ?? [])
    .filter((measurement) => !measurement.identity.hidden)
    .map((measurement): ChipData => {
      const centroid = shapeCentroid(measurement.shape);
      // PO request (draggable polygon labels) — the live drag preview (labelDragSession.ts)
      // overrides the persisted labelOffset while actively dragging this chip; otherwise the
      // persisted offset (if any) applies, else the plain centroid (unchanged prior behavior).
      // Polygon only, per the request's own "within its own polygon" scope.
      const liveDrag = $labelDrag && $labelDrag.measurementId === measurement.id ? $labelDrag : null;
      const offset = liveDrag ?? (measurement.shape.type === 'polygon' ? measurement.labelOffset : undefined);
      const worldPoint = offset ? { x: centroid.x + offset.dx, y: centroid.y + offset.dy } : centroid;
      const { x, y } = worldToScreen($viewport, worldPoint);
      // QA fix (manual area) — the floating chip is a projection of the same Measurement data
      // PropertyPanel/MeasurementList already show with the manual-area override applied; without
      // this it kept showing the raw geometric area even after a manual area was set.
      const { primaryLabel } = applyManualArea(
        computeMeasurementDisplay(measurement.shape, $activeSurface!.calibration, $displayUnit),
        measurement.manualArea,
        measurement.shape.type === 'polygon' ? measurement.shape.vertices : undefined,
        $displayUnit,
      );
      return {
        id: measurement.id,
        name: measurement.identity.name,
        primaryLabel,
        x,
        y,
        // item A13 "multi-select" — every selected Measurement's chip highlights, not just one.
        selected: $selectedMeasurementIds.has(measurement.id),
        draggable: measurement.shape.type === 'polygon',
        centroid,
      };
    });

  // Chips accept pointer events (click-select, double-click inline rename — PO request) only in
  // the neutral interaction state; while any drawing/Pan/calibration/split flow owns the pointer
  // they stay click-through, exactly as before.
  $: chipsInteractive = $activeTool === null && !$calibrating && !$splittingId;

  function renameMeasurement(id: string, name: string): void {
    const surface = $activeSurface;
    const measurement = surface?.layers.flatMap((l) => l.measurements).find((m) => m.id === id);
    if (!measurement) return;
    executeCommand((s) =>
      updateIdentityCommand({ surface: s, measurementId: id, identity: { ...measurement.identity, name } }),
    );
  }

  // PO request (per-vertex annotation) — one DOM chip per non-null Measurement.vertexLabels
  // entry, positioned at that same index's handle point (resizeHandlePoints, sceneRenderer.ts —
  // the exact same position `drawVertexHandles` draws a dot for) so a label always tracks its
  // vertex through edits/resizes/moves without needing its own cached coordinates.
  $: vertexLabelChips = ($activeSurface?.layers.flatMap((layer) => layer.measurements) ?? []).flatMap(
    (measurement) => {
      // item A5 "eye icon = real visibility" — a hidden Measurement's vertex labels stay hidden
      // with it (they annotate a shape that itself isn't drawn right now).
      if (measurement.identity.hidden || !measurement.vertexLabels) return [];
      const points = resizeHandlePoints(measurement.shape);
      if (!points) return [];
      return measurement.vertexLabels.flatMap((vertexLabel, index) => {
        const point = points[index];
        if (!vertexLabel || !point) return [];
        const { x, y } = worldToScreen($viewport, point);
        return [{ key: `${measurement.id}-${index}`, x, y, text: vertexLabel.text, color: vertexLabel.color }];
      });
    },
  );

  // PO request (canvas zoom, mouse wheel): registered via a plain `addEventListener` with
  // `{ passive: false }` rather than Svelte's `on:wheel` directive — wheel listeners are
  // increasingly defaulted to passive by browsers for scroll-perf reasons, and a passive listener
  // silently can't call `preventDefault()` (page would scroll along with the zoom). "Scrolling
  // outside the canvas retains normal page behaviour" (PO request) is automatic: this listener is
  // bound to the vector canvas element itself, so the browser never even dispatches it elsewhere.
  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomWheel({ x: event.clientX - rect.left, y: event.clientY - rect.top }, event.deltaY);
  }

  onMount(() => {
    resizeToContainer();
    resizeObserver = new ResizeObserver(() => resizeToContainer());
    resizeObserver.observe(container);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Found via live browser verification: readAccentColor() reads fresh on every redraw, but
    // nothing was actually *triggering* a redraw when the OS color scheme changed — the reactive
    // statement above only depends on surface/selection, not theme. Without this listener the
    // canvas silently kept drawing the old theme's accent until the next unrelated redraw.
    darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    darkSchemeQuery.addEventListener('change', redraw);
  });

  onDestroy(() => {
    canvas?.removeEventListener('wheel', onWheel);
    resizeObserver?.disconnect();
    darkSchemeQuery?.removeEventListener('change', redraw);
  });
</script>

<svelte:window
  on:mouseup={onWindowMouseUp}
  on:mousemove={onWindowMouseMove}
  on:keydown={onWindowKeydown}
  on:keyup={onWindowKeyup}
/>

<div
  class="canvas-stage"
  class:drawing={$activeTool !== null && $activeTool !== 'pan'}
  class:panning={spacePanning || $activeTool === 'pan' || !!$panDrag}
  class:active-pan={!!$panDrag}
  bind:this={container}
  data-testid="canvas-stage"
>
  <!-- ADR-002 two-layer composition: raster background (repainted only on image/resize change,
       never on every mouse move) behind the vector overlay canvas, which alone owns pointer
       events — the background is purely decorative, `pointer-events: none` in CSS below. -->
  <canvas bind:this={backgroundCanvas} class="background" data-testid="canvas-background"></canvas>
  <canvas
    bind:this={canvas}
    on:click={onClick}
    on:mousedown={onMouseDown}
    on:mousemove={onMouseMove}
    on:mouseup={onMouseUp}
    on:dblclick={onDblClick}
    on:contextmenu={onContextMenu}
  ></canvas>
  {#if showEmptyCanvasHint}
    <p class="empty-hint" data-testid="empty-canvas-hint">
      Import a plan, or choose a tool below to start drawing
    </p>
  {/if}
  {#each chips as chip (chip.id)}
    <MeasurementChip
      name={chip.name}
      primaryLabel={chip.primaryLabel}
      x={chip.x}
      y={chip.y}
      selected={chip.selected}
      interactive={chipsInteractive}
      draggable={chip.draggable}
      onSelect={(e) => (e.shiftKey ? toggleMeasurementSelection(chip.id) : selectMeasurement(chip.id))}
      onRename={(name) => renameMeasurement(chip.id, name)}
      onContextMenu={(e) => openMeasurementMenuFor(chip.id, e)}
      onDragStart={(e) => onChipDragStart(chip, e)}
    />
  {/each}
  {#each vertexLabelChips as label (label.key)}
    <div
      class="vertex-label-chip"
      style="left: {label.x}px; top: {label.y}px; color: {label.color};"
      data-testid="vertex-label-chip"
    >
      {label.text}
    </div>
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
  {#each splitLabels as label, i (i)}
    <div class="draft-label" style="left: {label.x}px; top: {label.y}px;" data-testid="split-label-{i}">
      {label.primaryLabel}
    </div>
  {/each}
  <!-- PO request (zoom %) — non-obstructive canvas-corner overlay, visually secondary (small,
       muted) but always readable; click resets to 100% (optional interaction, PO request),
       anchored at the canvas center so resetting doesn't recenter the view on some arbitrary
       corner point. -->
  <button
    type="button"
    class="zoom-indicator"
    on:click={onZoomIndicatorClick}
    on:dblclick={fitToContent}
    title="Click: reset to 100%. Double-click: zoom to fit"
    aria-label="Zoom level {zoomPercent}% — click to reset to 100%, double-click to zoom to fit"
    data-testid="zoom-indicator"
  >
    {zoomPercent}%
  </button>
  <ScaleBar />
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

  /* PO follow-up (UX review, item A2 "pan") — Space-held or middle-mouse-drag; wins over the
     drawing-tool crosshair above (this selector is later, same specificity — both are single
     classes on the same element). */
  .canvas-stage.panning canvas {
    cursor: grab;
  }

  .canvas-stage.panning.active-pan canvas {
    cursor: grabbing;
  }

  /* Both canvases positioned + inset so their paint order follows DOM order (background first,
     then the vector overlay on top) — a plain in-flow `display: block` canvas would paint
     *above* an absolutely-positioned sibling regardless of DOM order, which would have put the
     background on top instead. */
  canvas {
    display: block;
    position: absolute;
    inset: 0;
  }

  canvas.background {
    pointer-events: none;
  }

  .empty-hint {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    padding: 8px 14px;
    background: color-mix(in srgb, var(--af-surface-panel) 88%, transparent);
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-md);
    box-shadow: var(--af-shadow-e1);
    font-size: 13px;
    color: var(--af-ink-secondary);
    white-space: nowrap;
    pointer-events: none;
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

  .vertex-label-chip {
    position: absolute;
    transform: translate(8px, -8px);
    pointer-events: none;
    font-size: 12px;
    font-weight: 700;
    text-shadow:
      0 0 3px var(--af-surface-app),
      0 0 3px var(--af-surface-app),
      0 0 3px var(--af-surface-app);
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

  /* PO request (zoom %) — visually secondary (small, muted), non-obstructive corner, same
     "floating chrome over the canvas" language as ToolDock but far enough away not to compete
     with it (ToolDock is bottom-center). */
  .zoom-indicator {
    position: absolute;
    right: 12px;
    bottom: 12px;
    font: inherit;
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    color: var(--af-ink-secondary);
    background: var(--af-surface-raised);
    border: none;
    border-radius: var(--af-radius-sm);
    padding: 4px 8px;
    box-shadow: var(--af-shadow-e1);
    cursor: pointer;
  }

  .zoom-indicator:hover {
    color: var(--af-ink-primary);
  }

  .zoom-indicator:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: 1px;
  }
</style>
