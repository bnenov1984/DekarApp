import { createAuthClient } from 'better-auth/svelte';
import type { AuthAdapter, AuthError, AuthSession, AuthUser } from '../../application/ports/authAdapter.js';
import { type Result, fail, ok } from '../../core/domain/types.js';

// docs/26_ADR/ADR-007 / docs/23_API.md §4 — the one file in this codebase allowed to import
// `better-auth` (eslint-plugin-boundaries: adapters may depend on core/application/adapters, but
// nothing may depend on a concrete adapter — 21 §3). UI never imports `better-auth` or this
// client directly; it only ever sees the AuthAdapter port, through the composition root
// (ui/stores/persistence.ts) — the same discipline already applied to MapProvider/AIProvider.
//
// `baseURL` points at the areaflow-api instance (ADR-007). Nothing in this app requires it to be
// reachable (PD-012: cloud is optional, never on the critical path) — an unreachable backend
// surfaces as a NETWORK_ERROR result from sign-in/sign-up, not a crash, exactly like any other
// Adapters-layer failure (23 §8).

const client = createAuthClient({
  baseURL: import.meta.env.VITE_AUTH_API_URL ?? 'http://localhost:8787',
});

function toAuthUser(user: { id: string; email: string; name?: string | null }): AuthUser {
  return user.name ? { id: user.id, email: user.email, name: user.name } : { id: user.id, email: user.email };
}

function toAuthSession(session: { user: Parameters<typeof toAuthUser>[0]; session: { expiresAt: Date | string } }): AuthSession {
  const { expiresAt } = session.session;
  return {
    user: toAuthUser(session.user),
    expiresAt: expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
  };
}

/** Better Auth's own client throws only on genuine transport failure; an application-level
 * failure (wrong password, duplicate email) comes back as `{ error }`, not a rejection — this
 * maps both onto this port's `Result`/typed-rejection convention (23 §8) uniformly. */
function toAuthErrorReason(error: { status?: number; message?: string | undefined } | null): AuthError {
  if (error?.status === 422 || error?.message?.toLowerCase().includes('already exists')) {
    return { reason: 'EMAIL_ALREADY_REGISTERED' };
  }
  if (error?.status === 401 || error?.status === 400) return { reason: 'INVALID_CREDENTIALS' };
  return { reason: 'NETWORK_ERROR' };
}

export class BetterAuthAdapter implements AuthAdapter {
  async getSession(): Promise<AuthSession | null> {
    const { data } = await client.getSession();
    return data ? toAuthSession(data) : null;
  }

  async signUpWithPassword(email: string, password: string, name?: string): Promise<Result<AuthSession, AuthError>> {
    const { data, error } = await client.signUp.email({ email, password, name: name ?? email });
    if (error || !data) return fail(toAuthErrorReason(error));
    return this.sessionResultAfterAuth();
  }

  async signInWithPassword(email: string, password: string): Promise<Result<AuthSession, AuthError>> {
    const { data, error } = await client.signIn.email({ email, password });
    if (error || !data) return fail(toAuthErrorReason(error));
    return this.sessionResultAfterAuth();
  }

  async signOut(): Promise<void> {
    await client.signOut();
  }

  async requestPasswordReset(email: string): Promise<void> {
    await client.requestPasswordReset({ email, redirectTo: window.location.origin });
  }

  /** `signUp.email`/`signIn.email` return a bare `{ token, user }` — no `expiresAt` — so the
   * canonical `AuthSession` this port promises (which does carry one) always comes from a
   * follow-up `getSession()` read, the same call `onSessionChange` and a page-load `getSession()`
   * already use. */
  private async sessionResultAfterAuth(): Promise<Result<AuthSession, AuthError>> {
    const session = await this.getSession();
    return session ? ok(session) : fail({ reason: 'NETWORK_ERROR' });
  }

  onSessionChange(callback: (session: AuthSession | null) => void): () => void {
    const atom = client.useSession();
    return atom.listen((value) => {
      if (value.isPending) return;
      callback(value.data ? toAuthSession(value.data) : null);
    });
  }
}
