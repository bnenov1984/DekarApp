import type { Measurement, MeasurementId, Surface } from '../core/domain/entities.js';
import type { Point, Shape } from '../core/domain/types.js';
import { pointOnSegmentInterior, pointsCoincide } from '../core/drawing/coincidence.js';
import { addVertex } from '../core/drawing/drawingEngine.js';
import { windingReversed } from '../core/drawing/geometry.js';
import { editablePoints, isClosedEditable } from '../core/drawing/hitTest.js';
import { findMeasurement, replaceMeasurement } from './surfaceOps.js';
import { insertLabelAt, withVertexLabels } from './vertexLabels.js';

// PD-024 / INV-19 — topological editing. Shapes stay independent value objects (INV-1); a "shared"
// vertex is derived from coordinates at edit time and never stored — the same derived-not-stored
// approach as PD-021's Split group (splitGroup.ts), so no schema change and no migration.
//
// Two rules decide what is linked:
//  1. Exactly coincident coordinates (core/drawing/coincidence.ts) on a shape with an editable
//     point list — polygon, curve, freehand (the same set vertex editing works on, hitTest.ts).
//  2. Never between a measurement and any of its ancestors or descendants: a Split's parts are
//     joined to each other, not to the original parcel, which PD-009 keeps untouched.
//
// Hidden and locked shapes are reported like any other: hidden ones follow (hiding is visual
// only), and the commands decide that a locked participant refuses the whole edit.

export interface VertexRef {
  readonly measurementId: MeasurementId;
  readonly vertexIndex: number;
}

export interface EdgeRef {
  readonly measurementId: MeasurementId;
  readonly edgeIndex: number;
}

function allMeasurements(surface: Surface): Measurement[] {
  return surface.layers.flatMap((layer) => layer.measurements);
}

/** Ids of every ancestor of `id`, following `parentId` up the chain. The visited set guards
 * against a malformed cycle in stored data. */
function ancestorIds(surface: Surface, id: MeasurementId): Set<MeasurementId> {
  const ancestors = new Set<MeasurementId>();
  let current = findMeasurement(surface, id)?.measurement.parentId;
  while (current !== undefined && !ancestors.has(current)) {
    ancestors.add(current);
    current = findMeasurement(surface, current)?.measurement.parentId;
  }
  return ancestors;
}

export function isAncestorOrDescendant(surface: Surface, a: MeasurementId, b: MeasurementId): boolean {
  if (a === b) return false;
  return ancestorIds(surface, a).has(b) || ancestorIds(surface, b).has(a);
}

/** Every other measurement that may share vertices with `sourceId`, paired with its points. */
function candidates(surface: Surface, sourceId: MeasurementId): { measurement: Measurement; points: readonly Point[] }[] {
  return allMeasurements(surface).flatMap((measurement) => {
    if (measurement.id === sourceId || isAncestorOrDescendant(surface, sourceId, measurement.id)) return [];
    const points = editablePoints(measurement.shape);
    return points ? [{ measurement, points }] : [];
  });
}

/** The vertices of other shapes that sit exactly on vertex `vertexIndex` of `measurementId`. */
export function findLinkedVertices(surface: Surface, measurementId: MeasurementId, vertexIndex: number): VertexRef[] {
  const source = findMeasurement(surface, measurementId)?.measurement;
  const point = source && editablePoints(source.shape)?.[vertexIndex];
  if (!point) return [];

  return candidates(surface, measurementId).flatMap(({ measurement, points }) =>
    points.flatMap((other, index) => (pointsCoincide(point, other) ? [{ measurementId: measurement.id, vertexIndex: index }] : [])),
  );
}

/** Edges have straight-segment meaning only on polygons and freehand paths; a curve's edge between
 * two control points is not a straight line, so curves never share an edge (PO, 2026-10-10). */
function straightEdgePoints(measurement: Measurement): readonly Point[] | null {
  const { shape } = measurement;
  return shape.type === 'polygon' || shape.type === 'freehand' ? editablePoints(shape) : null;
}

function edgeCount(measurement: Measurement, points: readonly Point[]): number {
  return isClosedEditable(measurement.shape) ? points.length : points.length - 1;
}

/** The edges of other shapes that match edge `edgeIndex` of `measurementId` end to end, walked in
 * either direction. `edgeIndex` follows `addVertex`'s contract: the edge from vertex `edgeIndex`
 * to the next one. */
export function findSharedEdges(surface: Surface, measurementId: MeasurementId, edgeIndex: number): EdgeRef[] {
  const source = findMeasurement(surface, measurementId)?.measurement;
  const sourcePoints = source && straightEdgePoints(source);
  if (!source || !sourcePoints || edgeIndex < 0 || edgeIndex >= edgeCount(source, sourcePoints)) return [];
  const start = sourcePoints[edgeIndex]!;
  const end = sourcePoints[(edgeIndex + 1) % sourcePoints.length]!;

  return candidates(surface, measurementId).flatMap(({ measurement }) => {
    const points = straightEdgePoints(measurement);
    if (!points) return [];
    const refs: EdgeRef[] = [];
    for (let i = 0; i < edgeCount(measurement, points); i++) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      const sameDirection = pointsCoincide(a, start) && pointsCoincide(b, end);
      const opposite = pointsCoincide(a, end) && pointsCoincide(b, start);
      if (sameDirection || opposite) refs.push({ measurementId: measurement.id, edgeIndex: i });
    }
    return refs;
  });
}

/** PD-024 §6 — where a Split's dividing boundaries meet the parent's outline: points that are a
 * vertex of at least two parts and lie on the parent's outline (on a vertex or an edge). A
 * neighbour's edge can only run through the parent's outline, so these are the only candidates for
 * a new T-junction; boundary points strictly inside the parent are shared by its parts already. */
export function splitJunctions(parentShape: Shape, childShapes: readonly Shape[]): Point[] {
  const outline = editablePoints(parentShape);
  if (!outline) return [];
  const onOutline = (p: Point) =>
    outline.some((v, i) => pointsCoincide(p, v) || pointOnSegmentInterior(p, v, outline[(i + 1) % outline.length]!));
  const childPoints = childShapes.map((shape) => editablePoints(shape) ?? []);

  const junctions: Point[] = [];
  childPoints.forEach((points, i) => {
    for (const p of points) {
      if (junctions.some((q) => pointsCoincide(p, q))) continue;
      const sharedWithAnotherPart = childPoints.some((other, j) => j !== i && other.some((q) => pointsCoincide(p, q)));
      if (sharedWithAnotherPart && onOutline(p)) junctions.push(p);
    }
  });
  return junctions;
}

/** PD-024 §6 — closes the T-junctions a new Split creates: each of `points` that lies in the middle
 * of a neighbour's straight edge (polygon or freehand) is inserted into that edge as a vertex, so
 * the neighbour and the new parts share it from now on. The insertion is collinear, so no area
 * changes. Never touches `splitMeasurementId` itself (PD-009), its ancestors or its parts — none of
 * them link to the parts anyway. A locked neighbour is skipped rather than refusing the Split
 * (decided 2026-10-10): only the link is lost, never geometry. */
export function closeTJunctions(surface: Surface, points: readonly Point[], splitMeasurementId: MeasurementId): Surface {
  return points.reduce(
    (current, point) =>
      allMeasurements(current).reduce((next, measurement) => {
        if (measurement.id === splitMeasurementId || measurement.locked) return next;
        if (isAncestorOrDescendant(next, splitMeasurementId, measurement.id)) return next;
        const edgePoints = straightEdgePoints(measurement);
        if (!edgePoints || edgePoints.some((v) => pointsCoincide(v, point))) return next;
        let edgeIndex = -1;
        for (let i = 0; i < edgeCount(measurement, edgePoints); i++) {
          if (pointOnSegmentInterior(point, edgePoints[i]!, edgePoints[(i + 1) % edgePoints.length]!)) {
            edgeIndex = i;
            break;
          }
        }
        if (edgeIndex < 0) return next;
        const shape = addVertex(measurement.shape, edgeIndex, point);
        const vertexLabels = insertLabelAt(measurement.vertexLabels, edgeIndex + 1);
        return replaceMeasurement(next, measurement.id, withVertexLabels({ ...measurement, shape }, vertexLabels));
      }, current),
    surface,
  );
}

/** PD-025 — whether a linked edit (two or more participants, each given as its shape before and
 * after) would turn any closed participant inside out: e.g. a Split triangle whose shared vertex
 * is dragged past the line through its other two corners would otherwise lie on top of its
 * neighbour. A single-shape edit (Ctrl/⌘, or nothing linked) is never refused — one shape wound
 * the other way round is still valid. Open curves/freehand have no winding. Shared by the vertex
 * commands and vertexEditSession's live preview, so both apply the same rule. */
export function linkedEditTurnsInsideOut(participants: readonly { readonly before: Shape; readonly after: Shape }[]): boolean {
  if (participants.length < 2) return false;
  return participants.some(
    ({ before, after }) => isClosedEditable(before) && windingReversed(editablePoints(before)!, editablePoints(after)!),
  );
}

/** The commands' side of `linkedEditTurnsInsideOut`: throws, so the command's do() fails whole. */
export function assertNoParticipantTurnedInsideOut(
  before: Surface,
  after: Surface,
  participantIds: readonly MeasurementId[],
  commandName: string,
): void {
  const pairs = participantIds.map((id) => ({
    before: findMeasurement(before, id)!.measurement.shape,
    after: findMeasurement(after, id)!.measurement.shape,
  }));
  if (linkedEditTurnsInsideOut(pairs)) throw new Error(`${commandName}: a linked measurement would turn inside out`);
}
