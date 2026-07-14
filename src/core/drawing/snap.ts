import type { Point, Shape } from '../domain/types.js';
import { distance, nearestPointOnSegment } from './geometry.js';
import { rectangleCorners } from '../measurement/formulas.js';

// docs/18_DRAWING_ENGINE.md §4 — snap targets in priority order: vertex > edge > angle,
// plus self-snap (closing to the current shape's first vertex), which is always active
// regardless of `snapEnabled` (18 §4.4: "потребителят винаги може да затвори фигура дори при
// изключен snap").

export type SnapTargetKind = 'vertex' | 'edge' | 'angle' | 'self';

export interface SnapTarget {
  readonly kind: SnapTargetKind;
  readonly point: Point;
}

export interface SnapContext {
  /** other Shapes on the same Surface, snap candidates for vertex/edge targets */
  readonly otherShapes: readonly Shape[];
  /** already converted from screen-space px to Surface-space units by the caller (18 §4:
   * "толеранс... превърнат в Surface space динамично спрямо текущия zoom") */
  readonly toleranceSurfaceUnits: number;
  /** the previous vertex placed in the shape currently being drawn, for angle-constraint snap */
  readonly lastSegmentStart?: Point;
  /** the first vertex of the shape currently being drawn, for self-snap closing */
  readonly firstVertexOfCurrentShape?: Point;
  /** false while ⌥ is held (18 §4: temporarily disables vertex/edge/angle snap, not self-snap) */
  readonly snapEnabled: boolean;
  /** true while Shift is held (15 §13: angle constraint is opt-in, not automatic) */
  readonly angleConstraintHeld: boolean;
}

export interface SnapResult {
  readonly snapped: boolean;
  readonly position: Point;
  readonly target?: SnapTarget;
}

function shapePoints(shape: Shape): readonly Point[] {
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
      return [shape.center];
    case 'line':
      return [shape.from, shape.to];
  }
}

function shapeEdges(shape: Shape): Array<[Point, Point]> {
  const points = shapePoints(shape);
  if (shape.type === 'line' || shape.type === 'circle') return [];
  const closed = shape.type === 'polygon' || ((shape.type === 'curve' || shape.type === 'freehand') && shape.closed) || shape.type === 'rectangle';
  const n = points.length;
  const edges: Array<[Point, Point]> = [];
  const edgeCount = closed ? n : n - 1;
  for (let i = 0; i < edgeCount; i++) {
    edges.push([points[i]!, points[(i + 1) % n]!]);
  }
  return edges;
}

const ANGLE_INCREMENT = Math.PI / 4; // 45° — 18 §4.3

function snapToAngle(from: Point, to: Point): Point | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return null;
  const angle = Math.atan2(dy, dx);
  const snappedAngle = Math.round(angle / ANGLE_INCREMENT) * ANGLE_INCREMENT;
  return { x: from.x + dist * Math.cos(snappedAngle), y: from.y + dist * Math.sin(snappedAngle) };
}

/** 18 §4 — the single snap decision for one cursor position. Priority: self-snap (always) >
 * vertex > edge > angle (Shift-gated). */
export function snap(cursor: Point, context: SnapContext): SnapResult {
  if (context.firstVertexOfCurrentShape) {
    const d = distance(cursor, context.firstVertexOfCurrentShape);
    if (d <= context.toleranceSurfaceUnits) {
      return {
        snapped: true,
        position: context.firstVertexOfCurrentShape,
        target: { kind: 'self', point: context.firstVertexOfCurrentShape },
      };
    }
  }

  if (!context.snapEnabled) {
    return { snapped: false, position: cursor };
  }

  for (const other of context.otherShapes) {
    for (const p of shapePoints(other)) {
      if (distance(cursor, p) <= context.toleranceSurfaceUnits) {
        return { snapped: true, position: p, target: { kind: 'vertex', point: p } };
      }
    }
  }

  for (const other of context.otherShapes) {
    for (const [a, b] of shapeEdges(other)) {
      const nearest = nearestPointOnSegment(cursor, a, b);
      if (distance(cursor, nearest) <= context.toleranceSurfaceUnits) {
        return { snapped: true, position: nearest, target: { kind: 'edge', point: nearest } };
      }
    }
  }

  if (context.angleConstraintHeld && context.lastSegmentStart) {
    const snappedPoint = snapToAngle(context.lastSegmentStart, cursor);
    if (snappedPoint) {
      return { snapped: true, position: snappedPoint, target: { kind: 'angle', point: snappedPoint } };
    }
  }

  return { snapped: false, position: cursor };
}
