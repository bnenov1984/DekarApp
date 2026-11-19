import { describe, expect, it } from 'vitest';
import { formatScale, scaleCaptionText } from './scaleLabel.js';

describe('formatScale', () => {
  it('formats meters-per-pixel in the requested (area) display unit\'s paired length unit', () => {
    expect(formatScale(0.05, 'm2')).toBe('1 px = 0.05 m');
  });

  it('trims trailing zeros', () => {
    expect(formatScale(0.1, 'm2')).toBe('1 px = 0.1 m');
  });
});

describe('scaleCaptionText', () => {
  it('"Not calibrated" for a null (px-mode) Surface', () => {
    expect(scaleCaptionText(null, 'm2')).toBe('Not calibrated');
  });

  it('the same text formatScale produces for a linear Calibration', () => {
    expect(scaleCaptionText({ kind: 'linear', metersPerPixel: 0.05 }, 'm2')).toBe('1 px = 0.05 m');
  });

  it('null for a geo Calibration (no Map Surfaces reachable yet)', () => {
    expect(scaleCaptionText({ kind: 'geo' }, 'm2')).toBeNull();
  });
});
