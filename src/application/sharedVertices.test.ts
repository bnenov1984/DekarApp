import { describe, expect, it } from 'vitest';
import type { Layer, Measurement, Surface } from '../core/domain/entities.js';
import type { Point, Shape } from '../core/domain/types.js';
import { dissolveSplitGroup, removeMeasurements } from './surfaceOps.js';
import { closeTJunctions, findLinkedVertices, findSharedEdges, isAncestorOrDescendant, splitJunctions } from './sharedVertices.js';

// PD-024 / INV-19 — unit coverage for the pure link-finding helpers. The behaviour users see
// (linked move/insert/delete) is pinned down at the command seam, commands/roundtrip.test.ts.

function measurement(id: string, shape: Shape, extra: Partial<Measurement> = {}): Measurement {
  return { id, shape, identity: { name: id, color: '#2E7D32' }, provenance: 'Manual', locked: false, ...extra };
}

function polygon(id: string, vertices: Point[], extra: Partial<Measurement> = {}): Measurement {
  return measurement(id, { type: 'polygon', vertices }, extra);
}

function surfaceOf(measurements: Measurement[]): Surface {
  const layer: Layer = { id: 'layer1', name: 'Default', visible: true, order: 0, measurements };
  return { id: 'surface1', kind: 'image', calibration: null, layers: [layer] };
}

// A 10×10 parcel split into left/right halves, then the left half split into lower/upper:
//
//   (0,10)──(5,10)──(10,10)
//     │ upper │        │
//   (0,5)───(5,5)  right │      (5,5) lies on right's edge — a T-junction, not a shared vertex
//     │ lower │        │
//   (0,0)───(5,0)───(10,0)
const parcel = polygon('parcel', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
const left = polygon('left', [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }, { x: 0, y: 10 }], { parentId: 'parcel' });
const right = polygon('right', [{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 10 }], { parentId: 'parcel' });
const lower = polygon('lower', [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }], { parentId: 'left' });
const upper = polygon('upper', [{ x: 0, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 10 }, { x: 0, y: 10 }], { parentId: 'left' });

const nested = surfaceOf([parcel, left, right, lower, upper]);

describe('isAncestorOrDescendant', () => {
  it.each([
    ['parent → child', 'parcel', 'left', true],
    ['child → parent', 'left', 'parcel', true],
    ['grandparent → grandchild', 'parcel', 'lower', true],
    ['grandchild → grandparent', 'upper', 'parcel', true],
    ['siblings', 'left', 'right', false],
    ['cousins (aunt and niece)', 'right', 'lower', false],
    ['self', 'left', 'left', false],
  ])('%s', (_label, a, b, expected) => {
    expect(isAncestorOrDescendant(nested, a, b)).toBe(expected);
  });
});

describe('findLinkedVertices', () => {
  it('links the two halves of a split along their shared boundary, never the parent', () => {
    const surface = surfaceOf([parcel, left, right]);
    expect(findLinkedVertices(surface, 'left', 1)).toEqual([{ measurementId: 'right', vertexIndex: 0 }]); // (5,0)
    expect(findLinkedVertices(surface, 'right', 3)).toEqual([{ measurementId: 'left', vertexIndex: 2 }]); // (5,10)
  });

  it('does not link an outer corner of a part to its parent', () => {
    const surface = surfaceOf([parcel, left, right]);
    expect(findLinkedVertices(surface, 'left', 0)).toEqual([]); // (0,0) — only the parcel is there
    expect(findLinkedVertices(surface, 'parcel', 0)).toEqual([]);
  });

  it('links cousins but skips every ancestor in a nested split', () => {
    // lower's (5,0): left (its parent) and parcel (grandparent) are excluded; right is a cousin.
    expect(findLinkedVertices(nested, 'lower', 1)).toEqual([{ measurementId: 'right', vertexIndex: 0 }]);
    // lower's (5,5) and upper's (5,5) are siblings; right only has (5,5) on an edge (T-junction).
    expect(findLinkedVertices(nested, 'lower', 2)).toEqual([{ measurementId: 'upper', vertexIndex: 1 }]);
  });

  it('links manually drawn neighbours snapped vertex-to-vertex (PD-009 equivalence)', () => {
    const a = polygon('a', [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }]);
    const b = polygon('b', [{ x: 4, y: 0 }, { x: 8, y: 0 }, { x: 4, y: 4 }]);
    expect(findLinkedVertices(surfaceOf([a, b]), 'a', 2)).toEqual([{ measurementId: 'b', vertexIndex: 2 }]);
  });

  it('leaves points that are merely close independent', () => {
    const a = polygon('a', [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }]);
    const b = polygon('b', [{ x: 4.5, y: 0 }, { x: 8, y: 0 }, { x: 4.5, y: 4 }]);
    expect(findLinkedVertices(surfaceOf([a, b]), 'a', 1)).toEqual([]);
  });

  it('includes curve and freehand vertices, and hidden or locked shapes', () => {
    const a = polygon('a', [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }]);
    const curve = measurement('curve', { type: 'curve', controlPoints: [{ x: 4, y: 0 }, { x: 9, y: 9 }], closed: false });
    const freehand = measurement(
      'freehand',
      { type: 'freehand', points: [{ x: 7, y: 7 }, { x: 4, y: 0 }], closed: false },
      { identity: { name: 'freehand', color: '#000', hidden: true }, locked: true },
    );
    expect(findLinkedVertices(surfaceOf([a, curve, freehand]), 'a', 1)).toEqual([
      { measurementId: 'curve', vertexIndex: 0 },
      { measurementId: 'freehand', vertexIndex: 1 },
    ]);
  });

  it('ignores rectangles, circles and lines', () => {
    const a = polygon('a', [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }]);
    const rect = measurement('rect', { type: 'rectangle', origin: { x: 4, y: 0 }, width: 2, height: 2, rotation: 0 });
    const circle = measurement('circle', { type: 'circle', center: { x: 4, y: 0 }, radius: 1 });
    const line = measurement('line', { type: 'line', from: { x: 4, y: 0 }, to: { x: 9, y: 9 } });
    expect(findLinkedVertices(surfaceOf([a, rect, circle, line]), 'a', 1)).toEqual([]);
  });

  it('returns nothing for a source with no editable vertices or an unknown id', () => {
    const rect = measurement('rect', { type: 'rectangle', origin: { x: 0, y: 0 }, width: 2, height: 2, rotation: 0 });
    expect(findLinkedVertices(surfaceOf([rect]), 'rect', 0)).toEqual([]);
    expect(findLinkedVertices(surfaceOf([]), 'missing', 0)).toEqual([]);
  });

  it('links the survivors of a dissolved Split group to the former parent (PO, 2026-10-10)', () => {
    // Deleting a part dissolves the group: the survivor loses parentId and is an ordinary shape.
    const dissolved = dissolveSplitGroup(removeMeasurements(surfaceOf([parcel, left, right]), ['right']), 'parcel');
    expect(findLinkedVertices(dissolved, 'left', 0)).toEqual([{ measurementId: 'parcel', vertexIndex: 0 }]);
  });
});

describe('findSharedEdges', () => {
  it('finds the boundary edge two split halves share, walked in opposite directions', () => {
    const surface = surfaceOf([parcel, left, right]);
    // left edge 1: (5,0)→(5,10); right edge 3: (5,10)→(5,0)
    expect(findSharedEdges(surface, 'left', 1)).toEqual([{ measurementId: 'right', edgeIndex: 3 }]);
    expect(findSharedEdges(surface, 'right', 3)).toEqual([{ measurementId: 'left', edgeIndex: 1 }]);
  });

  it('finds an edge walked in the same direction', () => {
    const a = polygon('a', [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }]);
    const b = polygon('b', [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: -4 }]);
    expect(findSharedEdges(surfaceOf([a, b]), 'a', 0)).toEqual([{ measurementId: 'b', edgeIndex: 0 }]);
  });

  it('finds the closing edge of a closed shape (last vertex → first)', () => {
    const a = polygon('a', [{ x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 0 }]); // edge 2: (0,0)→(4,0)
    const b = polygon('b', [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: -4 }]);
    expect(findSharedEdges(surfaceOf([a, b]), 'a', 2)).toEqual([{ measurementId: 'b', edgeIndex: 0 }]);
  });

  it('does not report an edge only partly overlapping (T-junction)', () => {
    // lower's edge 1 (5,0)→(5,5) lies along right's edge 3 (5,10)→(5,0) but doesn't match it.
    expect(findSharedEdges(nested, 'lower', 1)).toEqual([]);
  });

  it('excludes ancestors and descendants', () => {
    // parcel edge 0 (0,0)→(10,0) — no other shape has exactly that edge; lower's (0,0)→(5,0)
    // matches left's own edge 0, but left is lower's parent.
    expect(findSharedEdges(nested, 'lower', 0)).toEqual([]);
  });

  it('ignores curves on either side (PO, 2026-10-10)', () => {
    const a = polygon('a', [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }]);
    const curve = measurement('curve', { type: 'curve', controlPoints: [{ x: 0, y: 0 }, { x: 4, y: 0 }], closed: false });
    const surface = surfaceOf([a, curve]);
    expect(findSharedEdges(surface, 'a', 0)).toEqual([]);
    expect(findSharedEdges(surface, 'curve', 0)).toEqual([]);
  });

  it('includes freehand edges', () => {
    const a = polygon('a', [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }]);
    const freehand = measurement('freehand', { type: 'freehand', points: [{ x: 4, y: 0 }, { x: 0, y: 0 }], closed: false });
    expect(findSharedEdges(surfaceOf([a, freehand]), 'a', 0)).toEqual([{ measurementId: 'freehand', edgeIndex: 0 }]);
  });
});

describe('splitJunctions', () => {
  it('returns the points where the parts meet the parent outline', () => {
    const points = splitJunctions(left.shape, [lower.shape, upper.shape]);
    expect(points).toHaveLength(2);
    expect(points).toEqual(expect.arrayContaining([{ x: 0, y: 5 }, { x: 5, y: 5 }]));
  });

  it('ignores corners only one part has, and junctions strictly inside the parent', () => {
    // three parts meeting at an interior point (5,5) of a 10x10 parcel, plus the outline points
    const a = { type: 'polygon' as const, vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }] };
    const b = { type: 'polygon' as const, vertices: [{ x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }] };
    const c = { type: 'polygon' as const, vertices: [{ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 5, y: 5 }] };
    const points = splitJunctions(parcel.shape, [a, b, c]);
    expect(points).toEqual(expect.arrayContaining([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]));
    expect(points).not.toContainEqual({ x: 5, y: 5 });
    expect(points).not.toContainEqual({ x: 10, y: 10 });
  });
});

describe('closeTJunctions', () => {
  it('inserts a junction lying on a neighbour edge into that edge, collinear', () => {
    const closed = closeTJunctions(nested, [{ x: 0, y: 5 }, { x: 5, y: 5 }], 'left');
    const shape = closed.layers[0]!.measurements.find((m) => m.id === 'right')!.shape;
    expect(shape).toEqual({ type: 'polygon', vertices: [{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 10 }, { x: 5, y: 5 }] });
    expect(findLinkedVertices(closed, 'upper', 1)).toContainEqual({ measurementId: 'right', vertexIndex: 4 });
  });

  it('never touches the split measurement, its ancestors or its parts', () => {
    const closed = closeTJunctions(nested, [{ x: 0, y: 5 }, { x: 5, y: 5 }], 'left');
    for (const id of ['parcel', 'left', 'lower', 'upper']) {
      expect(closed.layers[0]!.measurements.find((m) => m.id === id)).toEqual(nested.layers[0]!.measurements.find((m) => m.id === id));
    }
  });

  it('skips a locked neighbour instead of failing', () => {
    const surface = surfaceOf([parcel, left, { ...right, locked: true }, lower, upper]);
    expect(closeTJunctions(surface, [{ x: 5, y: 5 }], 'left')).toEqual(surface);
  });

  it('shifts the neighbour vertex labels, and does nothing where a vertex already exists', () => {
    const a = { text: 'A', color: '#1565C0' };
    const b = { text: 'B', color: '#1565C0' };
    // right, starting at (5,10) so the edge through (5,5) is edge 0 and the insertion lands at index 1
    const labelled = polygon('right', [{ x: 5, y: 10 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], { parentId: 'parcel', vertexLabels: [a, b] });
    const surface = surfaceOf([parcel, left, labelled, lower, upper]);
    const closed = closeTJunctions(surface, [{ x: 5, y: 5 }], 'left');
    expect(closed.layers[0]!.measurements.find((m) => m.id === 'right')!.vertexLabels).toEqual([a, null, b]);
    expect(closeTJunctions(closed, [{ x: 5, y: 5 }], 'left')).toEqual(closed);
  });

  it('ignores curves and shapes without edges through the point', () => {
    const curve = measurement('curve', { type: 'curve', controlPoints: [{ x: 5, y: 0 }, { x: 5, y: 10 }], closed: false });
    const far = polygon('far', [{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }]);
    const surface = surfaceOf([parcel, left, lower, upper, curve, far]);
    expect(closeTJunctions(surface, [{ x: 5, y: 5 }], 'left')).toEqual(surface);
  });
});
