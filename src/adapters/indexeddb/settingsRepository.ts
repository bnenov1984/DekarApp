import type { AppSettings, SettingsRepository } from '../../application/ports/settingsRepository.js';
import { DEFAULT_APP_SETTINGS } from '../defaultAppSettings.js';
import { openDatabase, getRecord, putRecord, SETTINGS_STORE } from './database.js';

// docs/26_ADR/ADR-004-indexeddb-local-storage.md — the real SettingsRepository. AppSettings is a
// single global record (no per-Project/per-Surface scoping — settingsRepository.ts's own
// independent-lifecycle note), stored under one fixed key in its own object store (same
// no-keyPath convention as BLOBS_STORE, database.ts) rather than a keyPath — there is exactly one
// row, ever.

const SETTINGS_KEY = 'app';

export class IndexedDbSettingsRepository implements SettingsRepository {
  constructor(private readonly dbName?: string) {}

  private db(): Promise<IDBDatabase> {
    return openDatabase(this.dbName);
  }

  /** Falls back to `DEFAULT_APP_SETTINGS` for a first-time install or a DB that just migrated to
   * the version adding SETTINGS_STORE (database.ts) — both are "no record saved yet", not an
   * error state. */
  async get(): Promise<AppSettings> {
    const db = await this.db();
    const stored = await getRecord<AppSettings>(db, SETTINGS_STORE, SETTINGS_KEY);
    return stored ?? DEFAULT_APP_SETTINGS;
  }

  async save(settings: AppSettings): Promise<void> {
    const db = await this.db();
    await putRecord(db, SETTINGS_STORE, settings, SETTINGS_KEY);
  }
}
