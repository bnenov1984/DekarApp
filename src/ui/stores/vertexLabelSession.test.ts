import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { activeVertexLabel, activateVertexLabel, clearActiveVertexLabel } from './vertexLabelSession.js';

describe('vertexLabelSession', () => {
  it('starts with no active vertex label', () => {
    expect(get(activeVertexLabel)).toBeNull();
  });

  it('activateVertexLabel sets the measurement/vertex pair', () => {
    activateVertexLabel('m1', 2);
    expect(get(activeVertexLabel)).toEqual({ measurementId: 'm1', vertexIndex: 2 });
  });

  it('activating a different vertex replaces the previous one, not accumulates', () => {
    activateVertexLabel('m1', 0);
    activateVertexLabel('m2', 3);
    expect(get(activeVertexLabel)).toEqual({ measurementId: 'm2', vertexIndex: 3 });
  });

  it('clearActiveVertexLabel resets to null', () => {
    activateVertexLabel('m1', 0);
    clearActiveVertexLabel();
    expect(get(activeVertexLabel)).toBeNull();
  });
});
