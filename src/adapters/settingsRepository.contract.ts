import { describe, expect, it } from 'vitest';
import type { SettingsRepository } from '../application/ports/settingsRepository.js';
import { DEFAULT_APP_SETTINGS } from './defaultAppSettings.js';

// docs/22_TDD.md §7 — one contract suite, run against both the fake (memory/settingsRepository.ts)
// and the real (indexeddb/settingsRepository.ts) implementations.

export function runSettingsRepositoryContractTests(make: () => SettingsRepository | Promise<SettingsRepository>): void {
  describe('SettingsRepository contract', () => {
    it('get() returns the default settings before any save() (first-run / not-yet-migrated state)', async () => {
      const settings = await make();
      expect(await settings.get()).toEqual(DEFAULT_APP_SETTINGS);
    });

    it('save then get round-trips exactly', async () => {
      const settings = await make();
      const custom = { ...DEFAULT_APP_SETTINGS, defaultUnit: 'ft2' as const };
      await settings.save(custom);
      expect(await settings.get()).toEqual(custom);
    });

    it('a later save() overwrites the earlier one entirely (single record, not merged)', async () => {
      const settings = await make();
      await settings.save({ ...DEFAULT_APP_SETTINGS, defaultUnit: 'cm2' as const });
      await settings.save({ ...DEFAULT_APP_SETTINGS, defaultUnit: 'in2' as const });
      expect((await settings.get()).defaultUnit).toBe('in2');
    });
  });
}
