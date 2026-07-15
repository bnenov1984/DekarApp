import type { CircleShape, Point, RectangleShape, Shape } from '../domain/types.js';
import { distance, nearestPointOnSegment } from './geometry.js';
import { rectangleCorners } from '../measurement/formulas.js';
import type { RectangleCorner } from './drawingEngine.js';

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

// docs/18_DRAWING_ENGINE.md §6 — vertex editing applies only to Polygon/Curve/Freehand (the
// shapes with an editable point list), the exact same restriction drawingEngine.ts's private
// `getPoints` enforces. A narrower, purpose-built helper rather than reuse of snap.ts's broader
// `shapePoints` (which also includes Rectangle corners/Circle center — snap *targets*, not
// vertex-*edit* candidates; Rectangle/Circle have no addVertex/editVertex support at all).

function editablePoints(shape: Shape): readonly Point[] | null {
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

function isClosedEditable(shape: Shape): boolean {
  return shape.type === 'polygon' || ((shape.type === 'curve' || shape.type === 'freehand') && shape.closed);
}

/** Returns the index of the vertex within `tolerance` of `point`, or `null` — used to decide
 * whether a mousedown starts a vertex-move drag (18 §6) vs. an edge-insert drag (below) vs.
 * nothing. `null` for shape types with no editable point list (Rectangle/Circle/Line). */
export function findVertexAt(point: Point, shape: Shape, tolerance: number): number | null {
  const points = editablePoints(shape);
  if (!points) return null;
  for (let i = 0; i < points.length; i++) {
    if (distance(point, points[i]!) <= tolerance) return i;
  }
  return null;
}

/** Returns the index of the edge (its *start* vertex index — matches `addVertex`'s `edgeIndex`
 * contract, drawingEngine.ts) within `tolerance` of `point`, or `null`. Callers check
 * `findVertexAt` first (18 §4 snap priority: vertex before edge) — this only needs to consider
 * points not already claimed as a vertex hit. */
export function findEdgeAt(point: Point, shape: Shape, tolerance: number): number | null {
  const points = editablePoints(shape);
  if (!points) return null;
  const closed = isClosedEditable(shape);
  const edgeCount = closed ? points.length : points.length - 1;
  for (let i = 0; i < edgeCount; i++) {
    const nearest = nearestPointOnSegment(point, points[i]!, points[(i + 1) % points.length]!);
    if (distance(point, nearest) <= tolerance) return i;
  }
  return null;
}

// Resize handle hit-testing (whole-shape resize, requested alongside whole-shape move) — separate
// from `findVertexAt`/`findEdgeAt` above since Rectangle/Circle are parametric (no point list);
// these check the shape's *derived* handle positions instead.

/** Returns the index (0-3, `rectangleCorners`' winding order, `formulas.ts`) of the corner within
 * `tolerance` of `point`, or `null`. Corner indices match `drawingEngine.ts`'s `RectangleCorner`
 * (`resizeRectangleCorner`'s "which corner is being dragged" parameter). */
export function findRectangleCornerAt(point: Point, shape: RectangleShape, tolerance: number): RectangleCorner | null {
  const corners = rectangleCorners(shape.origin, shape.width, shape.height, shape.rotation);
  for (let i = 0; i < corners.length; i++) {
    if (distance(point, corners[i]!) <= tolerance) return i as RectangleCorner;
  }
  return null;
}

/** True if `point` is within `tolerance` of the Circle's single resize handle — its rightmost
 * point (`center.x + radius, center.y`), matching where `sceneRenderer.ts` already starts
 * drawing the circle's stroke path, so the handle sits exactly on the visible outline. */
export function isNearCircleHandle(point: Point, shape: CircleShape, tolerance: number): boolean {
  const handle = { x: shape.center.x + shape.radius, y: shape.center.y };
  return distance(point, handle) <= tolerance;
}
