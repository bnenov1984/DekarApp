import type { CircleShape, Point, RectangleShape, Shape } from '../domain/types.js';
import { type Result, fail, ok } from '../domain/types.js';
import { isSimplePolygon } from './geometry.js';

// docs/18_DRAWING_ENGINE.md — the only Core module that mutates Shape. Never computes values
// (17), never renders (UI), never knows about Workspace/Extension/Report (PD-002/003).
//
// 23_API.md §2.1 convention: create/editVertex/addVertex throw only on documented-precondition
// violations (the caller is expected to have validated interactively before calling — 18 §6).
// removeVertex returns Result, because "would this deletion leave <3 vertices or self-intersect"
// is a normal, user-reachable outcome, not a programmer error.

export type ShapeParams =
  | { readonly type: 'polygon'; readonly vertices: readonly Point[] }
  | { readonly type: 'rectangle'; readonly origin: Point; readonly width: number; readonly height: number; readonly rotation?: number }
  | { readonly type: 'circle'; readonly center: Point; readonly radius: number }
  | { readonly type: 'curve'; readonly controlPoints: readonly Point[]; readonly closed?: boolean }
  | { readonly type: 'freehand'; readonly points: readonly Point[]; readonly closed?: boolean }
  | { readonly type: 'line'; readonly from: Point; readonly to: Point };

export type InvalidGeometryReason = 'TOO_FEW_VERTICES' | 'WOULD_SELF_INTERSECT';

/** 18 §2 — validates and constructs a Shape. Throws on structural precondition violations
 * (too few vertices, non-positive dimensions, self-intersecting polygon). */
export function create(params: ShapeParams): Shape {
  switch (params.type) {
    case 'polygon': {
      if (params.vertices.length < 3) throw new Error('create: polygon needs at least 3 vertices');
      if (!isSimplePolygon(params.vertices)) {
        throw new Error('create: polygon must be simple (non-self-intersecting)');
      }
      return { type: 'polygon', vertices: [...params.vertices] };
    }
    case 'rectangle':
      if (params.width <= 0 || params.height <= 0) {
        throw new Error('create: rectangle width/height must be positive');
      }
      return {
        type: 'rectangle',
        origin: params.origin,
        width: params.width,
        height: params.height,
        rotation: params.rotation ?? 0,
      };
    case 'circle':
      if (params.radius <= 0) throw new Error('create: circle radius must be positive');
      return { type: 'circle', center: params.center, radius: params.radius };
    case 'curve':
      if (params.controlPoints.length < 2) throw new Error('create: curve needs at least 2 control points');
      return { type: 'curve', controlPoints: [...params.controlPoints], closed: params.closed ?? false };
    case 'freehand':
      if (params.points.length < 2) throw new Error('create: freehand needs at least 2 points');
      return { type: 'freehand', points: [...params.points], closed: params.closed ?? false };
    case 'line':
      return { type: 'line', from: params.from, to: params.to };
  }
}

/** Shapes with an editable point list (18 §6: vertex editing applies to Polygon/Freehand,
 * extended here to Curve since it stores the same shape of data — controlPoints). Rectangle/
 * Circle/Line are parametric and have no vertex-editing affordance. */
function getPoints(shape: Shape): readonly Point[] | null {
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

function withPoints(shape: Shape, points: readonly Point[]): Shape {
  switch (shape.type) {
    case 'polygon':
      return { ...shape, vertices: points };
    case 'curve':
      return { ...shape, controlPoints: points };
    case 'freehand':
      return { ...shape, points };
    default:
      throw new Error(`withPoints: shape type '${shape.type}' has no point list`);
  }
}

function isClosed(shape: Shape): boolean {
  return shape.type === 'polygon' || ((shape.type === 'curve' || shape.type === 'freehand') && shape.closed);
}

/** 18 §6 — moves an existing vertex. Replaces the whole Shape VO (14 §3: replaced, not mutated
 * in place — this is what makes undo a cheap "keep the previous VO" operation, 21 §4.1). */
export function editVertex(shape: Shape, vertexIndex: number, newPosition: Point): Shape {
  const points = getPoints(shape);
  if (!points) throw new Error(`editVertex: shape type '${shape.type}' has no editable vertices`);
  if (vertexIndex < 0 || vertexIndex >= points.length) {
    throw new Error('editVertex: vertexIndex out of range');
  }
  const next = points.slice();
  next[vertexIndex] = newPosition;
  if (shape.type === 'polygon' && !isSimplePolygon(next)) {
    throw new Error('editVertex: resulting polygon would self-intersect');
  }
  return withPoints(shape, next);
}

/** 18 §6 — drag on an edge (not a vertex) inserts a new vertex at the drop position, between
 * the edge's two endpoints. */
export function addVertex(shape: Shape, edgeIndex: number, position: Point): Shape {
  const points = getPoints(shape);
  if (!points) throw new Error(`addVertex: shape type '${shape.type}' has no editable vertices`);
  const edgeCount = isClosed(shape) ? points.length : points.length - 1;
  if (edgeIndex < 0 || edgeIndex >= edgeCount) throw new Error('addVertex: edgeIndex out of range');

  const next = points.slice();
  next.splice(edgeIndex + 1, 0, position);
  if (shape.type === 'polygon' && !isSimplePolygon(next)) {
    throw new Error('addVertex: resulting polygon would self-intersect');
  }
  return withPoints(shape, next);
}

/** 18 §6 / 23 §2.1 — deletion has a normal, user-reachable failure mode (too few vertices left,
 * or the removal would make the polygon self-intersect) — a Result, not a throw. */
export function removeVertex(shape: Shape, vertexIndex: number): Result<Shape, InvalidGeometryReason> {
  const points = getPoints(shape);
  if (!points) throw new Error(`removeVertex: shape type '${shape.type}' has no editable vertices`);
  if (vertexIndex < 0 || vertexIndex >= points.length) {
    throw new Error('removeVertex: vertexIndex out of range');
  }

  const minVertices = shape.type === 'polygon' ? 3 : 2;
  if (points.length <= minVertices) return fail('TOO_FEW_VERTICES');

  const next = points.slice();
  next.splice(vertexIndex, 1);
  if (shape.type === 'polygon' && !isSimplePolygon(next)) return fail('WOULD_SELF_INTERSECT');

  return ok(withPoints(shape, next));
}

/** 0=origin corner, 1=+width, 2=+width+height, 3=+height (local, unrotated) — matches
 * `formulas.ts`'s `rectangleCorners` winding order, and `hitTest.ts`'s `findRectangleCornerAt`
 * returns indices in this same order. */
export type RectangleCorner = 0 | 1 | 2 | 3;

/** Resizes a Rectangle by dragging one corner, keeping the diagonally opposite corner fixed —
 * the standard resize convention. Correctly accounts for rotation (always 0 today, no rotation
 * UI exists yet, but this stays correct if that ever changes): `newPosition` is transformed into
 * the rectangle's local unrotated frame using the exact inverse of `formulas.ts`'s
 * `rectangleCorners` transform (same convention `hitTest.ts`'s `pointInRectangle` already uses),
 * resized in that frame, then the new origin is transformed back. Throws on a degenerate result
 * (width/height ≤ 0), same "structural precondition" convention as `create`/`editVertex`. */
export function resizeRectangleCorner(shape: RectangleShape, corner: RectangleCorner, newPosition: Point): RectangleShape {
  const { origin, width, height, rotation } = shape;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dx = newPosition.x - origin.x;
  const dy = newPosition.y - origin.y;
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;

  const localCorners: readonly Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const opposite = localCorners[(corner + 2) % 4]!;

  const minX = Math.min(localX, opposite.x);
  const maxX = Math.max(localX, opposite.x);
  const minY = Math.min(localY, opposite.y);
  const maxY = Math.max(localY, opposite.y);
  const newWidth = maxX - minX;
  const newHeight = maxY - minY;
  if (newWidth <= 0 || newHeight <= 0) {
    throw new Error('resizeRectangleCorner: resulting rectangle must have positive width/height');
  }

  const newOrigin: Point = {
    x: origin.x + minX * cos - minY * sin,
    y: origin.y + minX * sin + minY * cos,
  };

  return { ...shape, origin: newOrigin, width: newWidth, height: newHeight };
}

/** Resizes a Circle by dragging its edge handle — radius becomes the distance from center to the
 * drag position. Throws on a degenerate (zero) radius. */
export function resizeCircleRadius(shape: CircleShape, newEdgePosition: Point): CircleShape {
  const radius = Math.hypot(newEdgePosition.x - shape.center.x, newEdgePosition.y - shape.center.y);
  if (radius <= 0) throw new Error('resizeCircleRadius: radius must be positive');
  return { ...shape, radius };
}

/** Numeric-input counterpart to `resizeRectangleCorner` — sets an exact width/height (in the same
 * Surface-space px the shape's own fields are in) instead of a dragged pointer position, keeping
 * the origin corner (and rotation) fixed. Synthesizes the corner-2 world position `resizeRectangleCorner`
 * would see if the user dragged that corner to (width, height) in the rectangle's local frame, and
 * defers to it for the actual math (and its "width/height must be positive" validation) — a single
 * source of truth for the rotation-aware local→world transform. */
export function resizeRectangleDimensions(shape: RectangleShape, width: number, height: number): RectangleShape {
  const { origin, rotation } = shape;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const newPosition: Point = { x: origin.x + width * cos - height * sin, y: origin.y + width * sin + height * cos };
  return resizeRectangleCorner(shape, 2, newPosition);
}

/** Numeric-input counterpart to `resizeCircleRadius` — sets an exact radius directly instead of a
 * dragged edge position. Synthesizes the edge position `resizeCircleRadius` would see for that
 * radius and defers to it (its "radius must be positive" validation included). */
export function resizeCircleToRadius(shape: CircleShape, radius: number): CircleShape {
  return resizeCircleRadius(shape, { x: shape.center.x + radius, y: shape.center.y });
}

/** Translates any Shape by a rigid (dx, dy) offset — a rigid transform can never create a
 * self-intersection or invalidate any other shape invariant, so unlike every other mutation in
 * this file, this never throws. Applies uniformly to all six Shape variants (18 §6 whole-shape
 * move, requested to cover every shape type, not just the ones with vertex-level editing). */
export function translateShape(shape: Shape, dx: number, dy: number): Shape {
  const shift = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
  switch (shape.type) {
    case 'polygon':
      return { ...shape, vertices: shape.vertices.map(shift) };
    case 'rectangle':
      return { ...shape, origin: shift(shape.origin) };
    case 'circle':
      return { ...shape, center: shift(shape.center) };
    case 'curve':
      return { ...shape, controlPoints: shape.controlPoints.map(shift) };
    case 'freehand':
      return { ...shape, points: shape.points.map(shift) };
    case 'line':
      return { ...shape, from: shift(shape.from), to: shift(shape.to) };
  }
}
