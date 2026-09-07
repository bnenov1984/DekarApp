import type { Measurement, VertexLabel } from '../core/domain/entities.js';

// PO request (per-vertex annotation) — pure array bookkeeping for Measurement.vertexLabels
// (entities.ts). Kept separate from setVertexLabel.ts/addVertex.ts/removeVertex.ts so the same
// "sparse, index-aligned, trailing-nulls-trimmed" logic isn't duplicated across the three call
// sites that need to touch this array.

export type VertexLabels = readonly (VertexLabel | null)[];

function trimTrailingNulls(labels: (VertexLabel | null)[]): VertexLabels | undefined {
  while (labels.length > 0 && labels[labels.length - 1] === null) labels.pop();
  return labels.length > 0 ? labels : undefined;
}

/** Sets (or clears, via `label: null`) the label at `index`, padding with `null`s if `index` is
 * past the current end. */
export function setLabelAt(labels: VertexLabels | undefined, index: number, label: VertexLabel | null): VertexLabels | undefined {
  const next = labels ? [...labels] : [];
  while (next.length <= index) next.push(null);
  next[index] = label;
  return trimTrailingNulls(next);
}

/** A new vertex was inserted at `index` (addVertexCommand's `edgeIndex + 1`) — every existing
 * label at `>= index` shifts up by one; the new vertex itself starts unlabeled. No-op (returns
 * `undefined`) if there were no labels to shift in the first place. */
export function insertLabelAt(labels: VertexLabels | undefined, index: number): VertexLabels | undefined {
  if (!labels) return undefined;
  const next = [...labels];
  next.splice(index, 0, null);
  return trimTrailingNulls(next);
}

/** A vertex was removed at `index` (removeVertexCommand) — its label (if any) is discarded, and
 * every label at a higher index shifts down by one. */
export function removeLabelAt(labels: VertexLabels | undefined, index: number): VertexLabels | undefined {
  if (!labels) return undefined;
  const next = [...labels];
  if (index >= 0 && index < next.length) next.splice(index, 1);
  return trimTrailingNulls(next);
}

/** Applies a (possibly `undefined`) `vertexLabels` result to `measurement` — under this
 * project's `exactOptionalPropertyTypes`, setting an optional field to `undefined` is NOT the
 * same as omitting it, so every call site that might land back at "no labels at all" needs this
 * rather than a plain `{ ...measurement, vertexLabels }` spread (same reasoning as
 * surfaceOps.ts's `withoutParent`). */
export function withVertexLabels(measurement: Measurement, vertexLabels: VertexLabels | undefined): Measurement {
  if (vertexLabels === undefined) {
    const { vertexLabels: _omit, ...rest } = measurement;
    return rest;
  }
  return { ...measurement, vertexLabels };
}
