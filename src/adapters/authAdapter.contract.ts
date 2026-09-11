import { describe, expect, it } from 'vitest';
import type { AuthAdapter } from '../application/ports/authAdapter.js';

// docs/22_TDD.md §7 — one contract suite, meant to run against every AuthAdapter implementation.
// Today only one exists to run it against: the in-memory fake (memory/authAdapter.ts). The real
// implementation (adapters/betterAuth/authAdapter.ts) talks to a live areaflow-api instance
// (docs/26_ADR/ADR-007) that doesn't exist in this test environment — the same position
// IndexedDB's contract suite was in before ISS-008 gave it a real backing store to run against
// (fake-indexeddb). Wiring this suite up against a real deployed backend is future work, not an
// oversight.

const EMAIL = 'surveyor@example.com';
const PASSWORD = 'correct horse battery staple';

export function runAuthAdapterContractTests(makeAdapter: () => AuthAdapter): void {
  describe('AuthAdapter contract', () => {
    it('has no session before anyone signs in', async () => {
      const auth = makeAdapter();
      expect(await auth.getSession()).toBeNull();
    });

    it('sign-up establishes a session for the new user', async () => {
      const auth = makeAdapter();
      const result = await auth.signUpWithPassword(EMAIL, PASSWORD, 'Surveyor');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.user.email).toBe(EMAIL);
      expect(result.value.user.name).toBe('Surveyor');
      expect(await auth.getSession()).toEqual(result.value);
    });

    it('rejects sign-up with an already-registered email', async () => {
      const auth = makeAdapter();
      await auth.signUpWithPassword(EMAIL, PASSWORD);
      const result = await auth.signUpWithPassword(EMAIL, 'a different password');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.reason).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('signs in with correct credentials', async () => {
      const auth = makeAdapter();
      await auth.signUpWithPassword(EMAIL, PASSWORD);
      await auth.signOut();
      const result = await auth.signInWithPassword(EMAIL, PASSWORD);
      expect(result.ok).toBe(true);
      expect(await auth.getSession()).not.toBeNull();
    });

    it('rejects sign-in with the wrong password', async () => {
      const auth = makeAdapter();
      await auth.signUpWithPassword(EMAIL, PASSWORD);
      const result = await auth.signInWithPassword(EMAIL, 'wrong password');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.reason).toBe('INVALID_CREDENTIALS');
    });

    it('sign-out clears the session', async () => {
      const auth = makeAdapter();
      await auth.signUpWithPassword(EMAIL, PASSWORD);
      await auth.signOut();
      expect(await auth.getSession()).toBeNull();
    });

    it('notifies subscribers on sign-in and sign-out, and stops after unsubscribe', async () => {
      const auth = makeAdapter();
      const seen: unknown[] = [];
      const unsubscribe = auth.onSessionChange((session) => seen.push(session));

      await auth.signUpWithPassword(EMAIL, PASSWORD);
      await auth.signOut();
      expect(seen).toHaveLength(2);
      expect(seen[0]).not.toBeNull();
      expect(seen[1]).toBeNull();

      unsubscribe();
      await auth.signUpWithPassword('someone-else@example.com', PASSWORD);
      expect(seen).toHaveLength(2);
    });
  });
}
