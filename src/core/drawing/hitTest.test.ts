import { describe, expect, it } from 'vitest';
import { hitTestShape, findVertexAt, findEdgeAt } from './hitTest.js';
import type { CircleShape, LineShape, PolygonShape, RectangleShape } from '../domain/types.js';

const square: PolygonShape = {
  type: 'polygon',
  vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
};

describe('hitTestShape — polygon', () => {
  it('hits a point inside the polygon', () => {
    expect(hitTestShape({ x: 5, y: 5 }, square, 1)).toBe(true);
  });

  it('misses a point clearly outside', () => {
    expect(hitTestShape({ x: 50, y: 50 }, square, 1)).toBe(false);
  });

  it('hits a point exactly on the boundary within tolerance', () => {
    expect(hitTestShape({ x: -0.5, y: 5 }, square, 1)).toBe(true);
  });

  it('hits inside an L-shape notch correctly (non-convex, 18 §5 territory)', () => {
    const lShape: PolygonShape = {
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }],
    };
    expect(hitTestShape({ x: 1, y: 1 }, lShape, 0.1)).toBe(true); // inside the L
    expect(hitTestShape({ x: 3, y: 3 }, lShape, 0.1)).toBe(false); // inside the notch (removed area)
  });
});

describe('hitTestShape — rectangle', () => {
  it('hits inside an axis-aligned rectangle', () => {
    const rect: RectangleShape = { type: 'rectangle', origin: { x: 0, y: 0 }, width: 10, height: 5, rotation: 0 };
    expect(hitTestShape({ x: 5, y: 2 }, rect, 1)).toBe(true);
    expect(hitTestShape({ x: 15, y: 2 }, rect, 1)).toBe(false);
  });

  it('accounts for rotation', () => {
    const rect: RectangleShape = {
      type: 'rectangle',
      origin: { x: 0, y: 0 },
      width: 10,
      height: 2,
      rotation: Math.PI / 2, // rotated 90°: now extends along +y, not +x
    };
    expect(hitTestShape({ x: 5, y: 0 }, rect, 1)).toBe(false); // would hit if unrotated
    expect(hitTestShape({ x: 0, y: 5 }, rect, 1)).toBe(true); // hits post-rotation
  });
});

describe('hitTestShape — circle', () => {
  it('hits inside, misses outside', () => {
    const circle: CircleShape = { type: 'circle', center: { x: 0, y: 0 }, radius: 5 };
    expect(hitTestShape({ x: 3, y: 3 }, circle, 0)).toBe(true); // ~4.24 < 5
    expect(hitTestShape({ x: 10, y: 10 }, circle, 0)).toBe(false);
  });
});

describe('hitTestShape — line (open shape, hits only near the path)', () => {
  it('hits near the segment, misses far away, misses the "interior" of its bounding box', () => {
    const line: LineShape = { type: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 0 } };
    expect(hitTestShape({ x: 5, y: 0.2 }, line, 0.5)).toBe(true);
    expect(hitTestShape({ x: 5, y: 5 }, line, 0.5)).toBe(false); // "inside" the bbox but far from the line
  });
});

describe('hitTestShape — freehand', () => {
  it('closed freehand hits interior like a polygon', () => {
    const shape = { type: 'freehand' as const, points: square.vertices, closed: true };
    expect(hitTestShape({ x: 5, y: 5 }, shape, 1)).toBe(true);
  });

  it('open freehand hits only near the path, not its bbox interior', () => {
    const shape = {
      type: 'freehand' as const,
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      closed: false,
    };
    expect(hitTestShape({ x: 2, y: 8 }, shape, 0.5)).toBe(false); // inside bbox, far from the L-path
    expect(hitTestShape({ x: 5, y: 0.1 }, shape, 0.5)).toBe(true);
  });
});

// docs/18_DRAWING_ENGINE.md §6 — vertex-editing hit tests, restricted to Polygon/Curve/Freehand
// (the shapes with an editable point list, same restriction drawingEngine.ts's addVertex/
// editVertex enforce). Used by vertexEditSession.ts to decide vertex-drag vs. edge-insert-drag.

describe('findVertexAt', () => {
  it('finds the index of a vertex within tolerance', () => {
    expect(findVertexAt({ x: 10.2, y: 0.1 }, square, 1)).toBe(1); // (10,0) is index 1
  });

  it('returns null when no vertex is within tolerance', () => {
    expect(findVertexAt({ x: 5, y: 5 }, square, 1)).toBeNull();
  });

  it('returns null for shape types with no editable point list', () => {
    const rect: RectangleShape = { type: 'rectangle', origin: { x: 0, y: 0 }, width: 10, height: 5, rotation: 0 };
    const circle: CircleShape = { type: 'circle', center: { x: 0, y: 0 }, radius: 5 };
    const line: LineShape = { type: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 0 } };
    expect(findVertexAt({ x: 0, y: 0 }, rect, 1)).toBeNull();
    expect(findVertexAt({ x: 0, y: 0 }, circle, 1)).toBeNull();
    expect(findVertexAt({ x: 0, y: 0 }, line, 1)).toBeNull();
  });
});

describe('findEdgeAt', () => {
  it('finds the index of the edge (start-vertex index) within tolerance', () => {
    // square vertices: (0,0)=0, (10,0)=1, (10,10)=2, (0,10)=3 — the top edge is index 0 (0->1)
    expect(findEdgeAt({ x: 5, y: 0.2 }, square, 1)).toBe(0);
    // right edge (10,0)->(10,10) is index 1
    expect(findEdgeAt({ x: 9.8, y: 5 }, square, 1)).toBe(1);
  });

  it('returns null when no edge is within tolerance', () => {
    expect(findEdgeAt({ x: 5, y: 5 }, square, 1)).toBeNull();
  });

  it('respects open (non-closed) shapes — no wraparound edge from last to first point', () => {
    const openFreehand = {
      type: 'freehand' as const,
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      closed: false,
    };
    // the "closing" edge (10,10)->(0,0) would exist if this were treated as closed; it isn't.
    expect(findEdgeAt({ x: 5, y: 5 }, openFreehand, 1)).toBeNull();
  });

  it('returns null for shape types with no editable point list', () => {
    const circle: CircleShape = { type: 'circle', center: { x: 0, y: 0 }, radius: 5 };
    expect(findEdgeAt({ x: 5, y: 0 }, circle, 1)).toBeNull();
  });
});
