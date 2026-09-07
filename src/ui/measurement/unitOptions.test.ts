import { describe, expect, it } from 'vitest';
import { UNIT_OPTIONS, unitOptionFor, unitOptionsFor } from './unitOptions.js';

describe('unitOptions', () => {
  it('has exactly 3 metric and 2 imperial options', () => {
    expect(unitOptionsFor('metric').map((o) => o.label)).toEqual(['mm', 'cm', 'm']);
    expect(unitOptionsFor('imperial').map((o) => o.label)).toEqual(['in', 'ft']);
  });

  it('every option unit is unique and area-paired', () => {
    const units = UNIT_OPTIONS.map((o) => o.unit);
    expect(new Set(units).size).toBe(units.length);
    expect(units.every((u) => u.endsWith('2'))).toBe(true);
  });

  it('unitOptionFor resolves back to the matching option', () => {
    expect(unitOptionFor('cm2')?.label).toBe('cm');
    expect(unitOptionFor('ft2')?.label).toBe('ft');
    expect(unitOptionFor('ha')).toBeUndefined();
  });
});
