import type { Shape } from '../../core/domain/types.js';
import type { ShapeParams } from '../../core/drawing/drawingEngine.js';

/** Converts an already-concrete Shape back into ShapeParams so it can re-enter through
 * `drawingEngine.create()` — the mechanism that forces AI ghost geometry through the exact same
 * validation gate as manually-drawn geometry (20 §4). A self-intersecting AI-proposed boundary
 * is rejected here exactly as a self-intersecting manual polygon would be; there is no separate,
 * looser path for machine-originated shapes. */
export function shapeToParams(shape: Shape): ShapeParams {
  switch (shape.type) {
    case 'polygon':
      return { type: 'polygon', vertices: shape.vertices };
    case 'rectangle':
      return {
        type: 'rectangle',
        origin: shape.origin,
        width: shape.width,
        height: shape.height,
        rotation: shape.rotation,
      };
    case 'circle':
      return { type: 'circle', center: shape.center, radius: shape.radius };
    case 'curve':
      return { type: 'curve', controlPoints: shape.controlPoints, closed: shape.closed };
    case 'freehand':
      return { type: 'freehand', points: shape.points, closed: shape.closed };
    case 'line':
      return { type: 'line', from: shape.from, to: shape.to };
  }
}
