import type { Measurement, Surface } from '../../core/domain/entities.js';
import type { Point, Shape } from '../../core/domain/types.js';
import type { SnapTarget } from '../../core/drawing/snap.js';
import type { DrawingDraft } from '../stores/drawingSession.js';
import { rectangleCorners } from '../../core/measurement/formulas.js';

// docs/21_ARCHITECTURE.md §6.2/§6.3 — the scene graph: a *derived* projection of Shape VOs onto
// Canvas2D draw calls. This module never mutates a Shape and never owns geometry — it only
// reads. `drawBackgroundImage` below is the raster half of ADR-002's two-layer composition
// (CanvasStage.svelte owns a second, separately-repainted canvas for it) — everything else here
// remains the vector overlay.

function pathForShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
  switch (shape.type) {
    case 'polygon': {
      const [first, ...rest] = shape.vertices;
      if (!first) return;
      ctx.moveTo(first.x, first.y);
      for (const p of rest) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      return;
    }
    case 'rectangle': {
      const { origin, width, height, rotation } = shape;
      ctx.save();
      ctx.translate(origin.x, origin.y);
      ctx.rotate(rotation);
      ctx.rect(0, 0, width, height);
      ctx.restore();
      return;
    }
    case 'circle':
      ctx.moveTo(shape.center.x + shape.radius, shape.center.y);
      ctx.arc(shape.center.x, shape.center.y, shape.radius, 0, 2 * Math.PI);
      return;
    case 'line':
      ctx.moveTo(shape.from.x, shape.from.y);
      ctx.lineTo(shape.to.x, shape.to.y);
      return;
    case 'curve':
    case 'freehand': {
      const points: readonly Point[] = shape.type === 'curve' ? shape.controlPoints : shape.points;
      const [first, ...rest] = points;
      if (!first) return;
      ctx.moveTo(first.x, first.y);
      for (const p of rest) ctx.lineTo(p.x, p.y);
      if (shape.closed) ctx.closePath();
      return;
    }
  }
}

const DEFAULT_COLOR = '#5C6066'; // --af-ink-secondary fallback for a measurement with no identity color

function drawMeasurement(
  ctx: CanvasRenderingContext2D,
  measurement: Measurement,
  selected: boolean,
  accentColor: string,
): void {
  const color = measurement.identity.color || DEFAULT_COLOR;
  ctx.beginPath();
  pathForShape(ctx, measurement.shape);

  const isFillable = measurement.shape.type !== 'line';
  if (isFillable) {
    ctx.fillStyle = withAlpha(color, selected ? 0.2 : 0.12);
    ctx.fill();
  }

  ctx.lineWidth = selected ? 2.5 : 1.5;
  ctx.strokeStyle = selected ? accentColor : color;
  // docs/16_DESIGN_SYSTEM.md §"MeasurementShape states" — locked gets a short-dash outline (same
  // "protection from accidental editing" signal the Layers panel's lock icon/PropertyPanel's
  // disabled dimension inputs already give, just visible directly on canvas without opening
  // either panel). Always set explicitly (not just when locked) so this measurement's stroke never
  // inherits a dash pattern a previous locked measurement in the same drawSurface pass left behind.
  ctx.setLineDash(measurement.locked ? [4, 3] : []);
  ctx.stroke();
  ctx.setLineDash([]);
}

function withAlpha(hexOrColor: string, alpha: number): string {
  // measurement identity colors are plain hex (#RRGGBB) by construction (16 §2.3 palette,
  // dev-hook test values) — this only needs to handle that one shape, not arbitrary CSS color.
  if (!/^#[0-9a-fA-F]{6}$/.test(hexOrColor)) return hexOrColor;
  const r = parseInt(hexOrColor.slice(1, 3), 16);
  const g = parseInt(hexOrColor.slice(3, 5), 16);
  const b = parseInt(hexOrColor.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface ContainRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** "object-fit: contain" math (18/19). No longer `effectiveImageRect`'s (imageResizeSession.ts)
 * live per-resize default — that was ISS-010's "shape drifts off the plan on resize" bug, since it
 * re-fit the image to the container's current box size independently of the fixed Surface-space
 * coordinates every Shape uses. Kept as `drawBackgroundImage`'s defensive fallback below (never hit
 * once a rect is resolved from `effectiveImageRect`) and as generically useful "contain" math.
 * Returns a degenerate all-zero rect for any non-positive input rather than dividing by zero/NaN,
 * since a still-loading or zero-size container is a real, reachable state (resize observer fires
 * before the image decode resolves, or vice versa). */
export function computeContainRect(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number,
): ContainRect {
  if (imageWidth <= 0 || imageHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height };
}

/** The raster half of ADR-002's two-layer composition — drawn on its own canvas, behind the
 * vector overlay (CanvasStage.svelte), and only repainted when the image, its rect, or the
 * container size changes (never on every mouse move, unlike `drawSurface`/`drawInProgress`).
 * `explicitRect` is the user-resized `Surface.imageRect` (or a live drag preview) — falls back to
 * the "contain"-fit default only until the user first resizes it (PO request). */
export function drawBackgroundImage(
  ctx: CanvasRenderingContext2D,
  image: ImageBitmap,
  widthCss: number,
  heightCss: number,
  explicitRect?: ContainRect,
): void {
  ctx.clearRect(0, 0, widthCss, heightCss);
  const rect = explicitRect ?? computeContainRect(image.width, image.height, widthCss, heightCss);
  if (rect.width <= 0 || rect.height <= 0) return;
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
}

/** Clears and redraws every Measurement on `surface`. `widthCss`/`heightCss` are CSS-pixel
 * dimensions (the ctx transform already applies devicePixelRatio, CanvasStage.svelte §1).
 * `accentColor` is read from the live `--af-accent` custom property by the caller (CanvasStage)
 * so the selection outline follows the active theme (16 §5) — Canvas2D can't read CSS variables
 * itself, and this module stays pure/parameterized rather than reaching into `document`. */
export function drawSurface(
  ctx: CanvasRenderingContext2D,
  surface: Surface,
  selectedIds: ReadonlySet<string>,
  widthCss: number,
  heightCss: number,
  accentColor: string,
): void {
  ctx.clearRect(0, 0, widthCss, heightCss);
  for (const layer of surface.layers) {
    if (!layer.visible) continue;
    for (const measurement of layer.measurements) {
      // PO follow-up (UX review, item A5 "eye icon = real visibility") — a hidden Measurement
      // (identity.hidden, entities.ts) isn't drawn at all, not just its chip.
      if (measurement.identity.hidden) continue;
      // item A13 "multi-select" — every selected Measurement gets the same highlight treatment,
      // not just a single "the" selected one.
      drawMeasurement(ctx, measurement, selectedIds.has(measurement.id), accentColor);
    }
  }
}

// docs/18_DRAWING_ENGINE.md §4 — Tool Dock in-progress drawing overlay. Ghost/ dashed, never
// filled like a committed Measurement (15 §14.2/§18 W5 "ghost" visual language reused here for
// any not-yet-committed shape, not only AI proposals). Draws the placed points/drag rectangle so
// far plus a look-ahead segment to the live cursor position — never calls drawingEngine.create()
// or any Measurement Engine formula; this is pure preview, validation only happens at commit
// (drawingSession.ts).
function pathForDraft(ctx: CanvasRenderingContext2D, draft: DrawingDraft, cursor: Point | null): boolean {
  if (draft.kind === 'points') {
    const [first, ...rest] = draft.points;
    if (!first) return false;
    ctx.moveTo(first.x, first.y);
    for (const p of rest) ctx.lineTo(p.x, p.y);
    if (cursor) ctx.lineTo(cursor.x, cursor.y);
    return true;
  }

  if (draft.tool === 'rectangle') {
    const x = Math.min(draft.origin.x, draft.current.x);
    const y = Math.min(draft.origin.y, draft.current.y);
    const w = Math.abs(draft.current.x - draft.origin.x);
    const h = Math.abs(draft.current.y - draft.origin.y);
    ctx.rect(x, y, w, h);
    return true;
  }

  // circle
  const radius = Math.hypot(draft.current.x - draft.origin.x, draft.current.y - draft.origin.y);
  ctx.moveTo(draft.origin.x + radius, draft.origin.y);
  ctx.arc(draft.origin.x, draft.origin.y, radius, 0, 2 * Math.PI);
  return true;
}

const SNAP_GLYPH_SIZE = 5;

/** 18 §4 — distinct glyph per snap target kind: ◆ vertex/self-close, ▸ edge, ∠ angle. */
function drawSnapGlyph(ctx: CanvasRenderingContext2D, target: SnapTarget, accentColor: string): void {
  const { point, kind } = target;
  ctx.save();
  ctx.fillStyle = accentColor;
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1.5;

  if (kind === 'vertex' || kind === 'self') {
    ctx.beginPath();
    ctx.moveTo(point.x, point.y - SNAP_GLYPH_SIZE);
    ctx.lineTo(point.x + SNAP_GLYPH_SIZE, point.y);
    ctx.lineTo(point.x, point.y + SNAP_GLYPH_SIZE);
    ctx.lineTo(point.x - SNAP_GLYPH_SIZE, point.y);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'edge') {
    ctx.beginPath();
    ctx.moveTo(point.x - SNAP_GLYPH_SIZE, point.y - SNAP_GLYPH_SIZE);
    ctx.lineTo(point.x + SNAP_GLYPH_SIZE, point.y);
    ctx.lineTo(point.x - SNAP_GLYPH_SIZE, point.y + SNAP_GLYPH_SIZE);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(point.x, point.y, SNAP_GLYPH_SIZE, 0, 2 * Math.PI);
    ctx.stroke();
  }

  ctx.restore();
}

/** Draws the current draft (if any) plus the active snap-target glyph (if any) on top of the
 * already-drawn committed Surface (18 §4, 15 W5). Called from CanvasStage's redraw() after
 * `drawSurface`; never clears the canvas itself. */
export function drawInProgress(
  ctx: CanvasRenderingContext2D,
  draft: DrawingDraft | null,
  cursor: Point | null,
  snapTargetValue: SnapTarget | undefined,
  accentColor: string,
): void {
  if (draft) {
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = accentColor;
    ctx.beginPath();
    if (pathForDraft(ctx, draft, cursor)) ctx.stroke();
    ctx.restore();
  }

  if (snapTargetValue) drawSnapGlyph(ctx, snapTargetValue, accentColor);
}

// docs/18_DRAWING_ENGINE.md §6 — vertex/resize handle positions. Polygon/Curve/Freehand expose
// every point as a draggable vertex (unchanged); Rectangle exposes its 4 corners (resize, fixed
// opposite corner — `drawingEngine.ts`'s `resizeRectangleCorner`); Circle exposes 1 handle at its
// rightmost point (resize — `resizeCircleRadius`), matching where `pathForShape` above starts
// drawing the circle's own stroke. Line has none (whole-shape move only this slice, no dedicated
// resize handle requested) — a local switch rather than importing hitTest.ts's private helper,
// matching this file's existing `pathForShape` style. Exported (PO request, per-vertex
// annotation): CanvasStage.svelte reuses this same index<->position mapping to position vertex
// label chips, so a label always tracks its vertex through edits/resizes/moves.
export function resizeHandlePoints(shape: Shape): readonly Point[] | null {
  switch (shape.type) {
    case 'polygon':
      return shape.vertices;
    case 'curve':
      return shape.controlPoints;
    case 'freehand':
      return shape.points;
    case 'rectangle':
      return rectangleCorners(shape.origin, shape.width, shape.height, shape.rotation);
    case 'circle':
      return [{ x: shape.center.x + shape.radius, y: shape.center.y }];
    default:
      return null;
  }
}

const VERTEX_HANDLE_RADIUS_SCREEN_PX = 3;

/** World-space radius that renders as a constant `VERTEX_HANDLE_RADIUS_SCREEN_PX` on screen
 * regardless of the current viewport zoom (ISS-010-adjacent bug: handles used to be a fixed
 * world-space size, so `applyCtxTransform`'s zoom scale blew them up at zoom-in, defeating fine
 * placement). Same "divide a screen-px constant by scale" pattern CanvasStage.svelte already uses
 * for hit-test tolerance (`HANDLE_HIT_TOLERANCE_SCREEN_PX`). Exported and pure so it's unit-testable
 * independently of the CanvasRenderingContext2D draw call (see sceneRenderer.test.ts's note on why
 * the rest of this module isn't unit-tested). */
export function vertexHandleRadius(scale: number): number {
  return VERTEX_HANDLE_RADIUS_SCREEN_PX / scale;
}

/** Small filled circles (white-ringed for contrast over any fill color) at every vertex/corner/
 * radius handle — the "vertex-editing: върхове като дръжки" state from 16 §3.1 MeasurementShape,
 * extended to Rectangle corners and Circle's radius handle. `scale` is the current viewport zoom
 * (CanvasStage.svelte's `$viewport.scale`) — required so the handle stays a constant on-screen
 * size instead of scaling with the shape. */
export function drawVertexHandles(ctx: CanvasRenderingContext2D, shape: Shape, accentColor: string, scale: number): void {
  const points = resizeHandlePoints(shape);
  if (!points) return;
  const radius = vertexHandleRadius(scale);
  ctx.save();
  ctx.fillStyle = accentColor;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1.5;
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Live vertex-move/edge-insert drag preview — same dashed-ghost language as `drawInProgress`/
 * `drawCalibrationLine` (18 §6 / 15 W5 "one mental model for everything unconfirmed"), outline
 * only so the real (still-current) Measurement fill stays visible underneath while dragging. */
export function drawVertexEditPreview(ctx: CanvasRenderingContext2D, previewShape: Shape, accentColor: string, scale: number): void {
  drawPreviewOutline(ctx, previewShape, accentColor);
  drawVertexHandles(ctx, previewShape, accentColor, scale);
}

/** PD-024 — a neighbour moving along with a linked vertex drag: the same dashed ghost outline as
 * the dragged shape's own preview, but without handles — only the selected shape is editable. */
export function drawLinkedVertexPreview(ctx: CanvasRenderingContext2D, previewShape: Shape, accentColor: string): void {
  drawPreviewOutline(ctx, previewShape, accentColor);
}

function drawPreviewOutline(ctx: CanvasRenderingContext2D, previewShape: Shape, accentColor: string): void {
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = accentColor;
  ctx.beginPath();
  pathForShape(ctx, previewShape);
  ctx.stroke();
  ctx.restore();
}

/** docs/18_DRAWING_ENGINE.md §5 (PD-009) / 15 W5-style ghost — the Split line plus, once it
 * crosses the parent boundary exactly twice (`canSplit`, split.ts), both resulting child shapes
 * as dashed outlines. `children` is `null` until that condition holds — matches
 * `drawInProgress`/`drawCalibrationLine`'s "only render what's actually valid so far" discipline. */
export function drawSplitPreview(
  ctx: CanvasRenderingContext2D,
  splitLine: readonly Point[],
  children: readonly [Shape, Shape] | null,
  accentColor: string,
): void {
  if (splitLine.length >= 2) {
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = accentColor;
    ctx.beginPath();
    const [first, ...rest] = splitLine;
    ctx.moveTo(first!.x, first!.y);
    for (const p of rest) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();
  }

  if (children) {
    for (const child of children) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = accentColor;
      ctx.beginPath();
      pathForShape(ctx, child);
      ctx.stroke();
      ctx.restore();
    }
  }
}

/** PO follow-up (background layer selectability) — a plain solid outline, no handles, for the
 * Background image when it's selected but locked: enough feedback that "this is the active
 * layer" without implying it's draggable (`drawVertexHandles`/`drawVertexEditPreview` stay
 * reserved for the actually-interactive unlocked case). */
export function drawSelectionOutline(ctx: CanvasRenderingContext2D, shape: Shape, accentColor: string): void {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = accentColor;
  ctx.beginPath();
  pathForShape(ctx, shape);
  ctx.stroke();
  ctx.restore();
}

/** PO follow-up (UX review, item A13 "multi-select marquee") — the live rubber-band rectangle
 * while a marquee-select drag is in progress (CanvasStage.svelte): a translucent accent fill plus
 * a dashed outline, same "unconfirmed/in-progress" visual language as `drawInProgress`'s draft
 * shape preview and `drawCalibrationLine`'s reference line — nothing here is a Measurement, so it
 * never reaches `computeMeasurementDisplay`. */
export function drawMarquee(ctx: CanvasRenderingContext2D, from: Point, to: Point, accentColor: string): void {
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  const width = Math.abs(to.x - from.x);
  const height = Math.abs(to.y - from.y);

  ctx.save();
  ctx.fillStyle = withAlpha(accentColor, 0.1);
  ctx.fillRect(x, y, width, height);
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = accentColor;
  ctx.strokeRect(x, y, width, height);
  ctx.restore();
}

/** Grilling session 2026-11-18, Q8 — a faint dashed guide circle marking the vertex-label drag's
 * radius limit, shown only while a drag is actively in progress (same "ghost/in-progress" visual
 * language as `drawInProgress`/`drawSplitPreview`/`drawCalibrationLine`, just unfilled since there
 * is no "candidate shape" here, only a boundary). `center` is the vertex's own fixed point (never
 * the live-dragged label position) and `radius` is already in Surface-space (the caller divides
 * the screen-pixel constant by the current zoom scale before calling this, same convention as
 * `vertexHandleRadius` below). */
export function drawVertexLabelDragGuide(ctx: CanvasRenderingContext2D, center: Point, radius: number, accentColor: string): void {
  ctx.save();
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = accentColor;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** docs/19_IMPORT_EXPORT.md §3 / 15 W3 — the transient calibration reference line. Same ghost
 * visual language as `drawInProgress` (dashed, accent-colored) but never a Measurement preview —
 * this line never reaches `computeMeasurementDisplay`, only `CalibrationService`. */
export function drawCalibrationLine(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point | null,
  accentColor: string,
): void {
  if (!to) return;
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}
