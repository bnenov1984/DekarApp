import type { AppSettings, SettingsRepository } from '../../application/ports/settingsRepository.js';
import { DEFAULT_APP_SETTINGS } from '../defaultAppSettings.js';

// 22_TDD.md §7 — behaviorally equivalent to IndexedDbSettingsRepository for the shared contract
// suite. `get()` returns a fresh copy of DEFAULT_APP_SETTINGS until the first `save()` — matches
// the real adapter's "no persisted record yet" behavior (a first-time user, or the version-2 DB
// migration that introduces the settings object store, both start from the same default).
export class InMemorySettingsRepository implements SettingsRepository {
  private stored: AppSettings | null = null;

  async get(): Promise<AppSettings> {
    return this.stored ?? DEFAULT_APP_SETTINGS;
  }

  async save(settings: AppSettings): Promise<void> {
    this.stored = settings;
  }
}
