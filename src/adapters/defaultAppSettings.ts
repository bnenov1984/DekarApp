import type { AppSettings } from '../application/ports/settingsRepository.js';

// Shared between InMemorySettingsRepository and IndexedDbSettingsRepository so "what a brand-new
// install sees before ever calling save()" can't drift between the two — the whole point of the
// contract-test pattern (22_TDD.md §7) is that both adapters are behaviorally identical, and a
// default value duplicated in two files is exactly the kind of thing that quietly stops being
// identical after one gets edited and the other doesn't.
export const DEFAULT_APP_SETTINGS: AppSettings = {
  language: 'en',
  defaultUnit: 'm2',
  defaultWorkspaceId: 'general',
};
