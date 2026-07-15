import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { persist, storageErrorMessage } from './persistence.js';
import { StorageQuotaExceededError } from '../../adapters/errors.js';

// docs/23_API.md §8 — "these reach the UI, not theoretical". A real browser storage quota is
// typically gigabytes and not realistically triggerable in a live check (disclosed in the
// implementation plan) — this forces the typed error at the call site instead and confirms the
// UI-facing store reflects it gracefully, per 15 §16 (non-blocking, not a thrown error upward).

describe('persist', () => {
  it('clears the error message on a successful operation', async () => {
    storageErrorMessage.set('stale previous error');
    await persist(async () => {});
    expect(get(storageErrorMessage)).toBeNull();
  });

  it('surfaces a distinct message for StorageQuotaExceededError', async () => {
    await persist(async () => {
      throw new StorageQuotaExceededError();
    });
    expect(get(storageErrorMessage)).toMatch(/storage is full/i);
  });

  it('surfaces a generic message for any other persistence failure', async () => {
    await persist(async () => {
      throw new Error('disk error');
    });
    expect(get(storageErrorMessage)).toMatch(/could not save/i);
  });

  it('never throws — the caller always gets a resolved promise', async () => {
    await expect(
      persist(async () => {
        throw new Error('boom');
      }),
    ).resolves.toBeUndefined();
  });
});
