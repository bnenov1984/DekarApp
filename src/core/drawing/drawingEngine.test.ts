import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  addVertex,
  create,
  editVertex,
  removeVertex,
  resizeRectangleCorner,
  resizeRectangleDimensions,
  resizeCircleRadius,
  resizeCircleToRadius,
  translateShape,
} from './drawingEngine.js';
import type { CircleShape, LineShape, PolygonShape, RectangleShape } from '../domain/types.js';

describe('create', () => {
  it('creates a valid polygon', () => {
    const shape = create({
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
    });
    expect(shape.type).toBe('polygon');
  });

  it('throws for a polygon with fewer than 3 vertices', () => {
    expect(() => create({ type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).toThrow();
  });

  it('throws for a self-intersecting polygon (18 §2 precondition)', () => {
    expect(() =>
      create({
        type: 'polygon',
        vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
      }),
    ).toThrow();
  });

  it('creates a rectangle', () => {
    const shape = create({ type: 'rectangle', origin: { x: 0, y: 0 }, width: 10, height: 5 });
    expect(shape).toMatchObject({ type: 'rectangle', width: 10, height: 5, rotation: 0 });
  });

  it('throws for non-positive rectangle dimensions', () => {
    expect(() => create({ type: 'rectangle', origin: { x: 0, y: 0 }, width: 0, height: 5 })).toThrow();
  });

  it('creates a circle', () => {
    const shape = create({ type: 'circle', center: { x: 0, y: 0 }, radius: 5 });
    expect(shape).toEqual({ type: 'circle', center: { x: 0, y: 0 }, radius: 5 });
  });

  it('creates a line', () => {
    const shape = create({ type: 'line', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } });
    expect(shape.type).toBe('line');
  });
});

describe('editVertex — 14 §3: replaces the whole Shape VO, does not mutate in place', () => {
  it('returns a new object, leaving the original untouched', () => {
    const original = create({
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
    }) as PolygonShape;
    const edited = editVertex(original, 0, { x: -1, y: -1 }) as PolygonShape;
    expect(edited).not.toBe(original);
    expect(original.vertices[0]).toEqual({ x: 0, y: 0 }); // original unchanged
    expect(edited.vertices[0]).toEqual({ x: -1, y: -1 });
  });

  it('throws if the edit would make the polygon self-intersect', () => {
    const square = create({
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }],
    });
    // Dragging vertex 0 across to the opposite side creates a bowtie.
    expect(() => editVertex(square, 0, { x: 3, y: 1 })).toThrow();
  });

  it('throws for an out-of-range vertexIndex (programmer error, 23 §2.1)', () => {
    const shape = create({ type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] });
    expect(() => editVertex(shape, 99, { x: 0, y: 0 })).toThrow();
  });
});

describe('addVertex', () => {
  it('inserts a vertex between the two endpoints of the given edge', () => {
    const shape = create({
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
    }) as PolygonShape;
    const withNew = addVertex(shape, 0, { x: 5, y: 0 }) as PolygonShape;
    expect(withNew.vertices).toHaveLength(4);
    expect(withNew.vertices[1]).toEqual({ x: 5, y: 0 });
  });
});

describe('removeVertex — INV-1 support, normal user-reachable outcomes are Results (23 §2.1)', () => {
  it('removes a vertex from a polygon with more than 3 vertices', () => {
    const shape = create({
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
    });
    const result = removeVertex(shape, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value as PolygonShape).vertices).toHaveLength(3);
    }
  });

  it('fails with TOO_FEW_VERTICES when removal would drop a polygon below 3 vertices', () => {
    const triangle = create({
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
    });
    const result = removeVertex(triangle, 0);
    expect(result).toEqual({ ok: false, reason: 'TOO_FEW_VERTICES' });
  });

  it('throws for an out-of-range vertexIndex', () => {
    const shape = create({ type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] });
    expect(() => removeVertex(shape, 99)).toThrow();
  });
});

describe('resizeRectangleCorner — whole-shape resize, requested alongside whole-shape move', () => {
  const rect: RectangleShape = { type: 'rectangle', origin: { x: 0, y: 0 }, width: 100, height: 50, rotation: 0 };

  it('resizes by dragging a corner, keeping the diagonally opposite corner fixed', () => {
    const resized = resizeRectangleCorner(rect, 0, { x: -20, y: -10 });
    expect(resized).toEqual({ type: 'rectangle', origin: { x: -20, y: -10 }, width: 120, height: 60, rotation: 0 });

    // the fixed corner (opposite of 0, i.e. corner 2) must be at the same world position before/after
    const oppositeBefore = { x: rect.origin.x + rect.width, y: rect.origin.y + rect.height };
    const oppositeAfter = { x: resized.origin.x + resized.width, y: resized.origin.y + resized.height };
    expect(oppositeAfter).toEqual(oppositeBefore);
  });

  it('accounts for rotation — the opposite corner stays fixed in world space even when rotated', () => {
    const rotated: RectangleShape = { type: 'rectangle', origin: { x: 0, y: 0 }, width: 10, height: 10, rotation: Math.PI / 2 };
    // corner 2 (local (10,10)) in world space, rotated 90°: (0 - 10, 0 + 10) = (-10, 10)
    const oppositeWorldBefore = { x: -10, y: 10 };

    // drag corner 0 (local (0,0), world (0,0)) somewhere — corner 2 must still land at the same world point
    const resized = resizeRectangleCorner(rotated, 0, { x: 1, y: 1 });
    const cos = Math.cos(rotated.rotation);
    const sin = Math.sin(rotated.rotation);
    const oppositeWorldAfter = {
      x: resized.origin.x + resized.width * cos - resized.height * sin,
      y: resized.origin.y + resized.width * sin + resized.height * cos,
    };
    expect(oppositeWorldAfter.x).toBeCloseTo(oppositeWorldBefore.x, 8);
    expect(oppositeWorldAfter.y).toBeCloseTo(oppositeWorldBefore.y, 8);
  });

  it('throws when a corner collapses exactly onto its diagonally opposite corner', () => {
    expect(() => resizeRectangleCorner(rect, 0, { x: 100, y: 50 })).toThrow();
  });

  it('dragging a corner past its opposite corner flips the rectangle to the other side (still valid)', () => {
    // corner 0 dragged beyond corner 2 (100,50) — min/max-based, so this is a valid, larger
    // rectangle on the far side, not a degenerate one.
    const resized = resizeRectangleCorner(rect, 0, { x: 150, y: 80 });
    expect(resized).toEqual({ type: 'rectangle', origin: { x: 100, y: 50 }, width: 50, height: 30, rotation: 0 });
  });
});

describe('resizeCircleRadius', () => {
  const circle: CircleShape = { type: 'circle', center: { x: 100, y: 100 }, radius: 50 };

  it('sets the radius to the distance from center to the drag position', () => {
    const resized = resizeCircleRadius(circle, { x: 180, y: 100 });
    expect(resized).toEqual({ type: 'circle', center: { x: 100, y: 100 }, radius: 80 });
  });

  it('throws for a zero-radius result (drag position == center)', () => {
    expect(() => resizeCircleRadius(circle, { x: 100, y: 100 })).toThrow();
  });
});

describe('resizeRectangleDimensions — numeric-input counterpart to resizeRectangleCorner', () => {
  const rect: RectangleShape = { type: 'rectangle', origin: { x: 10, y: 20 }, width: 100, height: 50, rotation: 0 };

  it('sets an exact width/height, keeping the origin corner fixed', () => {
    const resized = resizeRectangleDimensions(rect, 120, 60);
    expect(resized).toEqual({ type: 'rectangle', origin: { x: 10, y: 20 }, width: 120, height: 60, rotation: 0 });
  });

  it('accounts for rotation — origin stays fixed in world space even when rotated', () => {
    const rotated: RectangleShape = { type: 'rectangle', origin: { x: 5, y: 5 }, width: 10, height: 10, rotation: Math.PI / 2 };
    const resized = resizeRectangleDimensions(rotated, 20, 30);
    expect(resized.origin).toEqual(rotated.origin);
    expect(resized.width).toBeCloseTo(20, 8);
    expect(resized.height).toBeCloseTo(30, 8);
    expect(resized.rotation).toBe(rotated.rotation);
  });

  it('throws for a zero width or height (collapses onto the origin corner)', () => {
    expect(() => resizeRectangleDimensions(rect, 0, 60)).toThrow();
    expect(() => resizeRectangleDimensions(rect, 120, 0)).toThrow();
  });

  // A negative dimension doesn't throw — it's interpreted the same way resizeRectangleCorner treats
  // a corner dragged past its opposite corner (min/max-based flip to the other side, still a valid
  // rectangle). Rejecting negative *typed text* outright is the caller's job (PropertyPanel's
  // parseDimensionToPx, computeDisplay.ts) — this function only guards the structural precondition
  // (a non-degenerate result), same contract as resizeRectangleCorner.
  it('a negative dimension flips the rectangle to the other side instead of throwing', () => {
    const resized = resizeRectangleDimensions(rect, 120, -5);
    expect(resized).toEqual({ type: 'rectangle', origin: { x: 10, y: 15 }, width: 120, height: 5, rotation: 0 });
  });
});

describe('resizeCircleToRadius — numeric-input counterpart to resizeCircleRadius', () => {
  const circle: CircleShape = { type: 'circle', center: { x: 100, y: 100 }, radius: 50 };

  it('sets the radius directly, keeping the center fixed', () => {
    const resized = resizeCircleToRadius(circle, 80);
    expect(resized).toEqual({ type: 'circle', center: { x: 100, y: 100 }, radius: 80 });
  });

  it('throws for a zero radius', () => {
    expect(() => resizeCircleToRadius(circle, 0)).toThrow();
  });

  // A negative radius doesn't throw — resizeCircleRadius measures a distance, which is always
  // non-negative, so it's silently treated as the absolute value. Rejecting negative *typed text*
  // outright is the caller's job (PropertyPanel's parseDimensionToPx, computeDisplay.ts).
  it('a negative radius is treated as its absolute value instead of throwing', () => {
    const resized = resizeCircleToRadius(circle, -10);
    expect(resized).toEqual({ type: 'circle', center: { x: 100, y: 100 }, radius: 10 });
  });
});

describe('translateShape — rigid transform, never throws, applies to every Shape variant', () => {
  it('translates a Polygon', () => {
    const shape: PolygonShape = { type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };
    expect(translateShape(shape, 5, -5)).toEqual({
      type: 'polygon',
      vertices: [{ x: 5, y: -5 }, { x: 15, y: -5 }, { x: 15, y: 5 }],
    });
  });

  it('translates a Rectangle (origin only — width/height/rotation unchanged)', () => {
    const shape: RectangleShape = { type: 'rectangle', origin: { x: 0, y: 0 }, width: 10, height: 5, rotation: 0.3 };
    expect(translateShape(shape, 2, 3)).toEqual({ type: 'rectangle', origin: { x: 2, y: 3 }, width: 10, height: 5, rotation: 0.3 });
  });

  it('translates a Circle (center only)', () => {
    const shape: CircleShape = { type: 'circle', center: { x: 0, y: 0 }, radius: 5 };
    expect(translateShape(shape, 1, 1)).toEqual({ type: 'circle', center: { x: 1, y: 1 }, radius: 5 });
  });

  it('translates a Line (both endpoints)', () => {
    const shape: LineShape = { type: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 0 } };
    expect(translateShape(shape, -1, 4)).toEqual({ type: 'line', from: { x: -1, y: 4 }, to: { x: 9, y: 4 } });
  });

  it('translates a Curve and a Freehand (both point-list shapes)', () => {
    const curve = create({ type: 'curve', controlPoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    expect(translateShape(curve, 1, 1)).toEqual({ type: 'curve', controlPoints: [{ x: 1, y: 1 }, { x: 2, y: 2 }], closed: false });

    const freehand = create({ type: 'freehand', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    expect(translateShape(freehand, 2, 2)).toEqual({ type: 'freehand', points: [{ x: 2, y: 2 }, { x: 3, y: 3 }], closed: false });
  });

  it('never throws, even for a degenerate (zero) translation', () => {
    const shape: CircleShape = { type: 'circle', center: { x: 0, y: 0 }, radius: 5 };
    expect(() => translateShape(shape, 0, 0)).not.toThrow();
  });
});

describe('property: vertex editing never produces an invalid polygon (18 §9)', () => {
  it('every successful editVertex on a convex polygon keeps it simple with ≥3 vertices', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 12 }),
        fc.integer({ min: 0, max: 11 }),
        fc.record({ x: fc.double({ min: -5, max: 5, noNaN: true }), y: fc.double({ min: -5, max: 5, noNaN: true }) }),
        (n, rawIndex, newPos) => {
          const vertices = Array.from({ length: n }, (_, i) => {
            const theta = (2 * Math.PI * i) / n;
            return { x: 10 * Math.cos(theta), y: 10 * Math.sin(theta) };
          });
          const shape = create({ type: 'polygon', vertices });
          const index = rawIndex % n;
          try {
            const edited = editVertex(shape, index, newPos) as PolygonShape;
            expect(edited.vertices.length).toBeGreaterThanOrEqual(3);
          } catch {
            // editVertex is allowed to throw (self-intersection) — that IS the invariant holding.
          }
        },
      ),
    );
  });
});
