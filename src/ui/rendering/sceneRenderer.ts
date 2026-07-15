import type { Measurement, Surface } from '../../core/domain/entities.js';
import type { Point, Shape } from '../../core/domain/types.js';

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
