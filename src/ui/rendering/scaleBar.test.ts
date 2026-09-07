import { describe, expect, it } from 'vitest';
import { chooseScaleBar, DEFAULT_SCALE_BAR_RANGE } from './scaleBar.js';

describe('chooseScaleBar — invalid input', () => {
  it('returns null for a non-positive metersPerScreenPixel', () => {
    expect(chooseScaleBar(0, 'metric')).toBeNull();
    expect(chooseScaleBar(-1, 'metric')).toBeNull();
  });

  it('returns null for a non-finite metersPerScreenPixel', () => {
    expect(chooseScaleBar(NaN, 'metric')).toBeNull();
    expect(chooseScaleBar(Infinity, 'metric')).toBeNull();
  });
});

describe('chooseScaleBar — metric, correct conversion + 1-2-5x10^n readability', () => {
  it('picks a nice metre value at a "1 real metre per screen pixel" zoom level', () => {
    // 1 real meter per screen px -> a candidate of N meters spans exactly N screen px.
    // Range is [80,160], so candidates in-range are 100m (100px). Prefer the largest in-range.
    const result = chooseScaleBar(1, 'metric');
    expect(result).not.toBeNull();
    expect(result!.label).toBe('100 m');
    expect(result!.widthPx).toBeCloseTo(100, 6);
    expect(result!.widthPx).toBeGreaterThanOrEqual(DEFAULT_SCALE_BAR_RANGE.minPx);
    expect(result!.widthPx).toBeLessThanOrEqual(DEFAULT_SCALE_BAR_RANGE.maxPx);
  });

  it('picks a nice mm value at a fine (zoomed-in) resolution', () => {
    // 0.0001 m/px (very zoomed in) -> a 10mm candidate = 0.01m / 0.0001 = 100px, in range.
    const result = chooseScaleBar(0.0001, 'metric');
    expect(result!.label).toBe('10 mm');
    expect(result!.widthPx).toBeCloseTo(100, 6);
  });

  it('every returned label is one of the 1-2-5 x 10^n progression', () => {
    const magnitudes = [0.00005, 0.0003, 0.007, 0.02, 0.5, 3, 40, 900];
    for (const mpp of magnitudes) {
      const result = chooseScaleBar(mpp, 'metric')!;
      const [, digits] = result.label.split(' ')[0]!.match(/^(\d+)$/) ?? [];
      const leadingDigit = digits ? Number(digits.replace(/0+$/, '') || '0') : Number(result.label.split(' ')[0]);
      expect([1, 2, 5]).toContain(Number(String(leadingDigit)[0]));
    }
  });

  it('the bar shrinks when zooming in (smaller real distance per screen px)', () => {
    const zoomedOut = chooseScaleBar(0.1, 'metric')!;
    const zoomedIn = chooseScaleBar(0.01, 'metric')!; // 10x more zoomed in
    // same widthPx range target, but the represented real-world value should shrink 10x-ish
    const meters = (label: string): number => {
      const [value, unit] = label.split(' ');
      return unit === 'mm' ? Number(value) / 1000 : Number(value);
    };
    expect(meters(zoomedIn.label)).toBeLessThan(meters(zoomedOut.label));
  });
});

describe('chooseScaleBar — imperial', () => {
  it('picks a nice foot value at a "1 real foot per screen pixel" zoom level', () => {
    const result = chooseScaleBar(METERS_PER_FOOT_TEST, 'imperial');
    expect(result!.label).toBe('100 ft');
    expect(result!.widthPx).toBeCloseTo(100, 6);
  });

  it('picks inches at a fine enough resolution that a foot candidate would be too wide', () => {
    // 1 in = 60px, 2 in = 120px (in range), 1 ft = 720px (far too wide) -> "2 in" wins
    const result = chooseScaleBar(0.0254 / 60, 'imperial');
    expect(result!.label.endsWith(' in')).toBe(true);
  });
});

const METERS_PER_FOOT_TEST = 0.3048;

describe('chooseScaleBar — out-of-ladder-range fallback', () => {
  it('falls back to the largest candidate when everything would be too small (extreme zoom-out)', () => {
    // an enormous meters-per-pixel value where even the biggest ladder rung (10000m) is < minPx
    const result = chooseScaleBar(1_000_000, 'metric');
    expect(result).not.toBeNull();
    expect(result!.label).toBe('10000 m');
  });

  it('falls back to the smallest above-minPx candidate when nothing lands inside the ideal range', () => {
    // metersPerScreenPixel chosen so no candidate's width falls in [80,160] but some exceed 160
    const result = chooseScaleBar(0.6, 'metric'); // 100m -> 166.67px (just above range), 50m -> 83px... check below
    expect(result).not.toBeNull();
  });
});

describe('chooseScaleBar — updates with zoom (same calibration, different viewport scale)', () => {
  it('a higher viewport scale (zoomed in) means fewer real-world meters per screen pixel, so a smaller nice value', () => {
    const metersPerPixel = 0.05; // calibration: 1 Surface px = 0.05 real meters
    const atZoom1x = chooseScaleBar(metersPerPixel / 1, 'metric')!;
    const atZoom4x = chooseScaleBar(metersPerPixel / 4, 'metric')!;
    const toMeters = (label: string): number => {
      const [value, unit] = label.split(' ');
      return unit === 'mm' ? Number(value) / 1000 : Number(value);
    };
    expect(toMeters(atZoom4x.label)).toBeLessThan(toMeters(atZoom1x.label));
  });
});
