import { describe, expect, it } from 'vitest';
import { setLabelAt, insertLabelAt, removeLabelAt, withVertexLabels } from './vertexLabels.js';
import { makeSquareMeasurement } from './commands/testFixtures.js';

const A = { text: 'A', color: '#2E7D32' };
const B = { text: 'B', color: '#1565C0' };
const C = { text: 'C', color: '#E65100' };

describe('setLabelAt', () => {
  it('sets a label on an empty (undefined) array, padding with nulls', () => {
    expect(setLabelAt(undefined, 2, A)).toEqual([null, null, A]);
  });

  it('overwrites an existing label at the same index', () => {
    expect(setLabelAt([A, B], 1, C)).toEqual([A, C]);
  });

  it('clearing the last label (label: null) trims back to undefined', () => {
    expect(setLabelAt([A], 0, null)).toBeUndefined();
  });

  it('clearing a middle label leaves a null gap, not trimmed', () => {
    expect(setLabelAt([A, B, C], 1, null)).toEqual([A, null, C]);
  });
});

describe('insertLabelAt', () => {
  it('is a no-op (stays undefined) when there were no labels', () => {
    expect(insertLabelAt(undefined, 1)).toBeUndefined();
  });

  it('shifts labels at and after the insertion index up by one', () => {
    expect(insertLabelAt([A, B, C], 1)).toEqual([A, null, B, C]);
  });

  it('inserting a trailing null is immediately trimmed back off (no labels after it to preserve)', () => {
    expect(insertLabelAt([A], 1)).toEqual([A]);
  });
});

describe('removeLabelAt', () => {
  it('is a no-op (stays undefined) when there were no labels', () => {
    expect(removeLabelAt(undefined, 0)).toBeUndefined();
  });

  it('discards the label at the removed index and shifts the rest down', () => {
    expect(removeLabelAt([A, B, C], 1)).toEqual([A, C]);
  });

  it('trims trailing nulls back to undefined when nothing labeled remains', () => {
    expect(removeLabelAt([null, A], 1)).toBeUndefined();
  });
});

describe('withVertexLabels', () => {
  // exactOptionalPropertyTypes (tsconfig.json) — `{ ...measurement, vertexLabels: undefined }`
  // is NOT the same as omitting the key entirely, so this must actually delete the property, not
  // just assign undefined to it (a plain `toEqual` wouldn't catch the difference; `Object.keys`
  // check below does).
  it('omits the vertexLabels key entirely when the result is undefined', () => {
    const withLabels = { ...makeSquareMeasurement('m1'), vertexLabels: [A] };
    const result = withVertexLabels(withLabels, undefined);
    expect(Object.keys(result)).not.toContain('vertexLabels');
    expect(result.vertexLabels).toBeUndefined();
  });

  it('sets the vertexLabels key when the result is defined', () => {
    const plain = makeSquareMeasurement('m1');
    const result = withVertexLabels(plain, [A]);
    expect(result.vertexLabels).toEqual([A]);
  });
});
