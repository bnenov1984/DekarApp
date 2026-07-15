import type { Point, Shape } from '../domain/types.js';

// Pure geometry query, same rationale as hitTest.ts: testable in isolation, no UI dependency,
// reusable wherever a Shape needs a single anchor point (today: MeasurementChip placement, UI
// commit 5). Vertex-average centroid, not true area-weighted centroid — a documented v1
// approximation: correct for regular/near-convex shapes, may land visually off-center (though
// always reasonably close) for extreme non-convex outlines. No design doc requires exact area
// centroid for label placement; upgrading this function later doesn't change its signature.

function averagePoint(points: readonly Point[]): Point {
  const n = points.length;
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / n, y: sum.y / n };
}

export function shapeCentroid(shape: Shape): Point {
  switch (shape.type) {
    case 'polygon':
      return averagePoint(shape.vertices);
    case 'rectangle': {
      const halfW = shape.width / 2;
      const halfH = shape.height / 2;
      const cos = Math.cos(shape.rotation);
      const sin = Math.sin(shape.rotation);
      return {
        x: shape.origin.x + halfW * cos - halfH * sin,
        y: shape.origin.y + halfW * sin + halfH * cos,
      };
    }
    case 'circle':
      return shape.center;
    case 'line':
      return { x: (shape.from.x + shape.to.x) / 2, y: (shape.from.y + shape.to.y) / 2 };
    case 'curve':
      return averagePoint(shape.controlPoints);
    case 'freehand':
      return averagePoint(shape.points);
  }
}
