import type { Unit } from '../../core/domain/types.js';

// Independent-lifecycle check: App-level settings exist even with zero Projects (they're read
// before Home ever shows a Recent list) and are never owned by any single Project — that's the
// justification for a repository of their own. Per-Project setting *overrides* (11 §1 "Settings:
// App → Project → Surface") are a field on the Project entity itself and travel with it through
// ProjectRepository — they don't need a port of their own, and adding one for them would be
// exactly the mechanical per-entity repository the task warned against.

export interface AppSettings {
  readonly language: string; // PD-010 — locale key, e.g. 'en' | 'bg'
  readonly defaultUnit: Unit;
  readonly defaultWorkspaceId: string;
}

export interface SettingsRepository {
  get(): Promise<AppSettings>;
  save(settings: AppSettings): Promise<void>;
}
