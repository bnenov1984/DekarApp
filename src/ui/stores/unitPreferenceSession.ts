import { writable, derived } from 'svelte/store';
import type { Unit } from '../../core/domain/types.js';
import { settingsRepository, persist } from './persistence.js';
import { unitOptionFor, type UnitSystem } from '../measurement/unitOptions.js';

// PO request (expanded unit system, §6/§7) — app-wide display-unit preference. Lives in
// AppSettings (settingsRepository.ts port, previously modeled but entirely unwired — ISS note in
// that file's own header), not per-Project: switching units is a *presentation* concern, the same
// preference should apply whichever project you open next (11 §1 "Settings: App -> Project ->
// Surface" layering — this is the App layer). `displayUnit` always holds the *area-paired* Unit
// variant (mm2/cm2/m2/in2/ft2 — unitOptions.ts's own header explains why one value is enough).

export const displayUnit = writable<Unit>('m2');

export const unitSystem = derived(displayUnit, (unit): UnitSystem => unitOptionFor(unit)?.system ?? 'metric');

/** Called once from App.svelte's onMount — loads the persisted preference (or
 * DEFAULT_APP_SETTINGS.defaultUnit for a first-run/not-yet-migrated install,
 * adapters/defaultAppSettings.ts) before any screen has a chance to render with the wrong unit
 * already committed to a measurement label. */
export async function initUnitPreference(): Promise<void> {
  const settings = await settingsRepository.get();
  displayUnit.set(settings.defaultUnit);
}

/** UnitSelector.svelte's only write path — updates the live store immediately (every projection
 * re-renders) and persists fire-and-forget (PD-012 D6 "no Save button" convention, same as every
 * other autosave in this app), reading the current settings first so an unrelated field
 * (language/theme/defaultWorkspaceId) is never clobbered by a save that only meant to change the
 * unit. */
export function setDisplayUnit(unit: Unit): void {
  displayUnit.set(unit);
  void persist(async () => {
    const settings = await settingsRepository.get();
    await settingsRepository.save({ ...settings, defaultUnit: unit });
  });
}
