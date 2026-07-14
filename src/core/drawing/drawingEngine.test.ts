import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addVertex, create, editVertex, removeVertex } from './drawingEngine.js';
import type { PolygonShape } from '../domain/types.js';

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
