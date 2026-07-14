import type { Point, Shape } from '../domain/types.js';
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
