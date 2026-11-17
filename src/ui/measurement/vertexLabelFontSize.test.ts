import { describe, expect, it } from 'vitest';
import {
  VERTEX_LABEL_DEFAULT_FONT_SIZE_PX,
  VERTEX_LABEL_FONT_SIZE_LEVELS,
  defaultVertexLabelFontSizeLevel,
  vertexLabelFontSizePx,
} from './vertexLabelFontSize.js';

describe('vertexLabelFontSizePx', () => {
  it('undefined renders at the pre-existing fixed size, unchanged for every old label', () => {
    expect(vertexLabelFontSizePx(undefined)).toBe(VERTEX_LABEL_DEFAULT_FONT_SIZE_PX);
  });

  it('level 1 is the minimum (8px) and level 10 is the maximum (24px)', () => {
    expect(vertexLabelFontSizePx(1)).toBe(8);
    expect(vertexLabelFontSizePx(VERTEX_LABEL_FONT_SIZE_LEVELS)).toBe(24);
  });

  it('is monotonically increasing across every level', () => {
    let previous = -Infinity;
    for (let level = 1; level <= VERTEX_LABEL_FONT_SIZE_LEVELS; level++) {
      const px = vertexLabelFontSizePx(level);
      expect(px).toBeGreaterThan(previous);
      previous = px;
    }
  });

  it('clamps an out-of-range level instead of producing an unreadable or negative size', () => {
    expect(vertexLabelFontSizePx(0)).toBe(vertexLabelFontSizePx(1));
    expect(vertexLabelFontSizePx(-5)).toBe(vertexLabelFontSizePx(1));
    expect(vertexLabelFontSizePx(99)).toBe(vertexLabelFontSizePx(VERTEX_LABEL_FONT_SIZE_LEVELS));
  });

  it('rounds a non-integer level to the nearest valid one', () => {
    expect(vertexLabelFontSizePx(3.4)).toBe(vertexLabelFontSizePx(3));
    expect(vertexLabelFontSizePx(3.6)).toBe(vertexLabelFontSizePx(4));
  });
});

describe('defaultVertexLabelFontSizeLevel', () => {
  it('maps back to a level within one rounding step of the fixed default px', () => {
    const level = defaultVertexLabelFontSizeLevel();
    expect(level).toBeGreaterThanOrEqual(1);
    expect(level).toBeLessThanOrEqual(VERTEX_LABEL_FONT_SIZE_LEVELS);
    expect(Math.abs(vertexLabelFontSizePx(level) - VERTEX_LABEL_DEFAULT_FONT_SIZE_PX)).toBeLessThan(2);
  });
});
