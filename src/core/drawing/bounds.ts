import type { Point, Shape } from '../domain/types.js';
import { rectangleCorners } from '../measurement/formulas.js';

// PO follow-up (UX review, item B8 "zoom-to-fit") — pure axis-aligned bounding box math, no
// rendering/viewport concerns here (those stay UI-layer, viewport.ts/CanvasStage.svelte); this is
// the one piece "how big is this shape, in Surface space" that both a future feature and the
// zoom-to-fit UI need, so it lives in Core rather than being computed ad hoc in a component.

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

function boundsOfPoints(points: readonly Point[]): Bounds | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Axis-aligned bounding box of a single Shape, in Surface space. `null` only for a Shape whose
 * point list is empty (not reachable through `drawingEngine.create()`'s own validation, but this
 * stays defensive rather than assuming that invariant from outside Core). Rectangle uses its 4
 * (possibly rotated) corners — min/max over those 4 points is already the correct axis-aligned
 * box, no separate rotated-rect-bbox formula needed. */
export function shapeBounds(shape: Shape): Bounds | null {
  switch (shape.type) {
    case 'polygon':
      return boundsOfPoints(shape.vertices);
    case 'rectangle':
      return boundsOfPoints(rectangleCorners(shape.origin, shape.width, shape.height, shape.rotation));
    case 'circle':
      return {
        minX: shape.center.x - shape.radius,
        minY: shape.center.y - shape.radius,
        maxX: shape.center.x + shape.radius,
        maxY: shape.center.y + shape.radius,
      };
    case 'line':
      return boundsOfPoints([shape.from, shape.to]);
    case 'curve':
      return boundsOfPoints(shape.controlPoints);
    case 'freehand':
      return boundsOfPoints(shape.points);
  }
}

/** Smallest Bounds containing both inputs — how callers fold a list of per-shape Bounds (plus,
 * for zoom-to-fit, an optional background image rect) into one overall Bounds. */
export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** PO follow-up (UX review, item A13 "multi-select marquee") — true if the two axis-aligned boxes
 * overlap at all (including merely touching at an edge). CanvasStage.svelte's rubber-band drag
 * uses this against each Measurement's `shapeBounds` to decide marquee membership — "any part of
 * the shape's bounding box is inside the drag rect", the same intersects-not-fully-contains
 * convention most drag-select tools use (a shape half inside the marquee still gets picked up). */
export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}
