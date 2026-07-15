import { writable } from 'svelte/store';
import { IndexedDbProjectRepository } from '../../adapters/indexeddb/projectRepository.js';
import { IndexedDbSurfaceRepository } from '../../adapters/indexeddb/surfaceRepository.js';
import { StorageQuotaExceededError } from '../../adapters/errors.js';

// The composition root: the one place the UI layer picks a concrete Adapters-layer
// implementation (ADR-004: IndexedDB) for the ports Application defines. No DI framework exists
// in this codebase (ADR-006: plain state over abstraction where the app is this shallow) — a
// plain module-level singleton is the equivalent for two repositories.

export const projectRepository = new IndexedDbProjectRepository();
export const surfaceRepository = new IndexedDbSurfaceRepository();

/** 15 §16 — non-blocking; autosave (PD-012 D6: no Save button) has no explicit action to retry
 * from, so a failure surfaces as a StatusBar banner (StatusBar.svelte), never a blocking dialog. */
export const storageErrorMessage = writable<string | null>(null);

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
