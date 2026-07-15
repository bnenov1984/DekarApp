import type { Point, Shape } from '../domain/types.js';
import { distance, nearestPointOnSegment } from './geometry.js';

// docs/21_ARCHITECTURE.md §6.3 — hit-testing is "custom" (Canvas has no per-shape DOM events)
// but is pure geometry, so it lives in Core like everything else Drawing-Engine-adjacent
// (testable in isolation, no UI/rendering dependency). UI (CanvasStage) only supplies a cursor
// Point already converted to Surface space and a tolerance in Surface units.

function pointInPolygon(point: Point, vertices: readonly Point[]): boolean {
  // standard ray-casting (even-odd rule)
  let inside = false;
  const n = vertices.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = vertices[i]!;
    const vj = vertices[j]!;
    const intersects =
      vi.y > point.y !== vj.y > point.y &&
      point.x < ((vj.x - vi.x) * (point.y - vi.y)) / (vj.y - vi.y) + vi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function nearestDistanceToPolyline(point: Point, points: readonly Point[], closed: boolean): number {
  const n = points.length;
  const edgeCount = closed ? n : n - 1;
  let min = Infinity;
  for (let i = 0; i < edgeCount; i++) {
    const nearest = nearestPointOnSegment(point, points[i]!, points[(i + 1) % n]!);
    min = Math.min(min, distance(point, nearest));
  }
  return min;
}

/** Point-in-rectangle accounting for rotation: transform the point into the rectangle's local
 * (unrotated) space, then a plain bounds check. */
function pointInRectangle(point: Point, origin: Point, width: number, height: number, rotation: number): boolean {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  return localX >= 0 && localX <= width && localY >= 0 && localY <= height;
}

/** True if `point` (Surface space) hits `shape` within `tolerance` (Surface units) — closed
 * shapes (Polygon, closed Freehand/Curve, Rectangle, Circle) hit anywhere in their interior;
 * open shapes (Line, open Freehand/Curve) hit only near the path itself. */
export function hitTestShape(point: Point, shape: Shape, tolerance: number): boolean {
  switch (shape.type) {
    case 'polygon':
      return pointInPolygon(point, shape.vertices) || nearestDistanceToPolyline(point, shape.vertices, true) <= tolerance;
    case 'rectangle':
      return pointInRectangle(point, shape.origin, shape.width, shape.height, shape.rotation);
    case 'circle':
      return distance(point, shape.center) <= shape.radius;
    case 'line':
      return nearestPointToLine(point, shape.from, shape.to) <= tolerance;
    case 'curve':
    case 'freehand': {
      const points = shape.type === 'curve' ? shape.controlPoints : shape.points;
      if (shape.closed && points.length >= 3) {
        return pointInPolygon(point, points) || nearestDistanceToPolyline(point, points, true) <= tolerance;
      }
      return nearestDistanceToPolyline(point, points, false) <= tolerance;
    }
  }
}

function nearestPointToLine(point: Point, from: Point, to: Point): number {
  return distance(point, nearestPointOnSegment(point, from, to));
}
