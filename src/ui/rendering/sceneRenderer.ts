import type { Measurement, Surface } from '../../core/domain/entities.js';
import type { Point, Shape } from '../../core/domain/types.js';
import type { SnapTarget } from '../../core/drawing/snap.js';
import type { DrawingDraft } from '../stores/drawingSession.js';

// docs/21_ARCHITECTURE.md §6.2/§6.3 — the scene graph: a *derived* projection of Shape VOs onto
// Canvas2D draw calls. This module never mutates a Shape and never owns geometry — it only
// reads. No raster layer yet (no Image/PDF import exists to have a background) — this is the
// vector overlay alone (ADR-002's two-layer composition becomes relevant once import exists).

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
  ctx.stroke();
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

/** Clears and redraws every Measurement on `surface`. `widthCss`/`heightCss` are CSS-pixel
 * dimensions (the ctx transform already applies devicePixelRatio, CanvasStage.svelte §1).
 * `accentColor` is read from the live `--af-accent` custom property by the caller (CanvasStage)
 * so the selection outline follows the active theme (16 §5) — Canvas2D can't read CSS variables
 * itself, and this module stays pure/parameterized rather than reaching into `document`. */
export function drawSurface(
  ctx: CanvasRenderingContext2D,
  surface: Surface,
  selectedId: string | null,
  widthCss: number,
  heightCss: number,
  accentColor: string,
): void {
  ctx.clearRect(0, 0, widthCss, heightCss);
  for (const layer of surface.layers) {
    if (!layer.visible) continue;
    for (const measurement of layer.measurements) {
      drawMeasurement(ctx, measurement, measurement.id === selectedId, accentColor);
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

/** docs/19_IMPORT_EXPORT.md §3 / 15 W3 — the transient calibration reference line. Same ghost
 * visual language as `drawInProgress` (dashed, accent-colored) but never a Measurement preview —
 * this line never reaches `computeMeasurementDisplay`, only `CalibrationService`. */
// docs/18_DRAWING_ENGINE.md §6 — vertex editing handles. Same shape-type restriction as
// hitTest.ts's `findVertexAt`/`findEdgeAt` (Polygon/Curve/Freehand only); a local switch rather
// than importing hitTest.ts's private helper, matching this file's existing `pathForShape` style.
function editablePointsForHandles(shape: Shape): readonly Point[] | null {
  switch (shape.type) {
    case 'polygon':
      return shape.vertices;
    case 'curve':
      return shape.controlPoints;
    case 'freehand':
      return shape.points;
    default:
      return null;
  }
}

const VERTEX_HANDLE_SIZE = 4;

/** Small filled squares (white-ringed for contrast over any fill color) at every editable
 * vertex — the "vertex-editing: върхове като дръжки" state from 16 §3.1 MeasurementShape. */
export function drawVertexHandles(ctx: CanvasRenderingContext2D, shape: Shape, accentColor: string): void {
  const points = editablePointsForHandles(shape);
  if (!points) return;
  ctx.save();
  ctx.fillStyle = accentColor;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1.5;
  for (const p of points) {
    ctx.beginPath();
    ctx.rect(p.x - VERTEX_HANDLE_SIZE, p.y - VERTEX_HANDLE_SIZE, VERTEX_HANDLE_SIZE * 2, VERTEX_HANDLE_SIZE * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Live vertex-move/edge-insert drag preview — same dashed-ghost language as `drawInProgress`/
 * `drawCalibrationLine` (18 §6 / 15 W5 "one mental model for everything unconfirmed"), outline
 * only so the real (still-current) Measurement fill stays visible underneath while dragging. */
export function drawVertexEditPreview(ctx: CanvasRenderingContext2D, previewShape: Shape, accentColor: string): void {
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = accentColor;
  ctx.beginPath();
  pathForShape(ctx, previewShape);
  ctx.stroke();
  ctx.restore();
  drawVertexHandles(ctx, previewShape, accentColor);
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
