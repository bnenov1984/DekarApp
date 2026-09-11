import { writable } from 'svelte/store';
import { IndexedDbProjectRepository } from '../../adapters/indexeddb/projectRepository.js';
import { IndexedDbSurfaceRepository } from '../../adapters/indexeddb/surfaceRepository.js';
import { IndexedDbStorageAdapter } from '../../adapters/indexeddb/storageAdapter.js';
import { IndexedDbSettingsRepository } from '../../adapters/indexeddb/settingsRepository.js';
import { BetterAuthAdapter } from '../../adapters/betterAuth/authAdapter.js';
import { HttpCloudAdapter } from '../../adapters/http/cloudAdapter.js';
import { StorageQuotaExceededError } from '../../adapters/errors.js';

// The composition root: the one place the UI layer picks a concrete Adapters-layer
// implementation (ADR-004: IndexedDB) for the ports Application defines. No DI framework exists
// in this codebase (ADR-006: plain state over abstraction where the app is this shallow) — a
// plain module-level singleton is the equivalent for two repositories.

export const projectRepository = new IndexedDbProjectRepository();
export const surfaceRepository = new IndexedDbSurfaceRepository();
/** ISS-008's "first real StorageAdapter implementation" trigger, finally wired to a caller
 * (imageAssetSession.ts) — 19_IMPORT_EXPORT.md §2.1 image blob storage. */
export const storageAdapter = new IndexedDbStorageAdapter();
/** PO request (unit preference persistence) — AppSettings was modeled (settingsRepository.ts
 * port) but had zero implementations/callers until now. */
export const settingsRepository = new IndexedDbSettingsRepository();
/** Phase 2 of the SaaS migration (docs/26_ADR/ADR-007) — the first Adapters-layer implementation
 * of AuthAdapter (23_API.md §4). Talks to areaflow-api; PD-012 still holds, since nothing
 * requires it to be reachable — see BetterAuthAdapter's own header for the failure story. */
export const authAdapter = new BetterAuthAdapter();
/** Phase 3 of the SaaS migration (docs/26_ADR/ADR-007) — first Adapters-layer implementation of
 * CloudAdapter (23_API.md §4/§6). PD-012 still holds: local IndexedDB repositories above remain
 * the source of truth for everything except the explicit "Save to account"/"Open cloud project"
 * actions (ui/stores/cloudProjectsSession.ts) that reach this adapter on purpose. */
export const cloudAdapter = new HttpCloudAdapter();

/** 15 §16 — non-blocking; autosave (PD-012 D6: no Save button) has no explicit action to retry
 * from, so a failure surfaces as a StatusBar banner (StatusBar.svelte), never a blocking dialog. */
export const storageErrorMessage = writable<string | null>(null);

/** PO follow-up (UX review, item B10 "storage error as toast") — dismissing the toast
 * (StorageErrorToast.svelte) only clears the currently-displayed message; it doesn't fix the
 * underlying condition. If storage is still full/unavailable, the very next failed `persist()`
 * call sets it right back — same "ephemeral until the next real event" contract every toast UI
 * has, not a way to silence a genuinely unresolved problem. */
export function dismissStorageError(): void {
  storageErrorMessage.set(null);
}

/** 23 §8 — the one adapter error this app actually distinguishes today; any other persistence
 * failure still surfaces (never silently swallowed) but with a generic message. */
export async function persist(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
    storageErrorMessage.set(null);
  } catch (error) {
    storageErrorMessage.set(
      error instanceof StorageQuotaExceededError
        ? 'Storage is full — recent changes may not be saved.'
        : 'Could not save — check your device storage.',
    );
  }
}
