import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { displayUnit, unitSystem, setDisplayUnit } from './unitPreferenceSession.js';

// PO request (expanded unit system) — actual IndexedDB persistence (setDisplayUnit's
// fire-and-forget settingsRepository.save call) is covered by the isolated-db-name
// SettingsRepository contract suite (adapters/indexeddb/settingsRepository.test.ts); this only
// checks the synchronous store-update contract, same "don't assert real persistence at the
// UI-store layer" precedent as every other *Session.test.ts file's autosave calls.

describe('unitSystem — derived from displayUnit', () => {
  it('resolves the metric/imperial system for every unit option', () => {
    displayUnit.set('mm2');
    expect(get(unitSystem)).toBe('metric');
    displayUnit.set('ft2');
    expect(get(unitSystem)).toBe('imperial');
  });
});

describe('setDisplayUnit', () => {
  it('updates the displayUnit store immediately (before the persist round-trip resolves)', () => {
    setDisplayUnit('in2');
    expect(get(displayUnit)).toBe('in2');
    expect(get(unitSystem)).toBe('imperial');
  });
});
