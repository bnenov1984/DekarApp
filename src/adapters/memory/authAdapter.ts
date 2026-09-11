import type { AuthAdapter, AuthError, AuthSession } from '../../application/ports/authAdapter.js';
import { type Result, fail, ok } from '../../core/domain/types.js';

// docs/22_TDD.md §7 — the fake for AuthAdapter's contract suite (../authAdapter.contract.ts).
// Simulates a tiny single-process "auth server" entirely in memory: a Map of registered accounts
// plus one current session, enough to exercise sign-up/sign-in/sign-out/session-change without a
// network. No real password hashing — Better Auth's own server owns that in production
// (docs/26_ADR/ADR-007); this fake only needs to be behaviorally equivalent for the contract this
// port defines, same as InMemoryProjectRepository stands in for IndexedDB.

interface StoredAccount {
  readonly password: string;
  readonly name?: string;
}

export class InMemoryAuthAdapter implements AuthAdapter {
  private readonly accounts = new Map<string, StoredAccount>();
  private session: AuthSession | null = null;
  private readonly listeners = new Set<(session: AuthSession | null) => void>();

  async getSession(): Promise<AuthSession | null> {
    return this.session;
  }

  async signUpWithPassword(email: string, password: string, name?: string): Promise<Result<AuthSession, AuthError>> {
    if (this.accounts.has(email)) return fail({ reason: 'EMAIL_ALREADY_REGISTERED' });
    this.accounts.set(email, name === undefined ? { password } : { password, name });
    return ok(this.establishSession(email, name));
  }

  async signInWithPassword(email: string, password: string): Promise<Result<AuthSession, AuthError>> {
    const account = this.accounts.get(email);
    if (!account || account.password !== password) return fail({ reason: 'INVALID_CREDENTIALS' });
    return ok(this.establishSession(email, account.name));
  }

  async signOut(): Promise<void> {
    this.session = null;
    this.notify();
  }

  async requestPasswordReset(_email: string): Promise<void> {
    // No-op: the fake has no email transport to verify against. The contract only requires this
    // to resolve, not that a real email was sent (23_API.md §8 — Adapters reject with a typed
    // error for real failures; this one simply never fails).
  }

  onSessionChange(callback: (session: AuthSession | null) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private establishSession(email: string, name?: string): AuthSession {
    const session: AuthSession = {
      user: name === undefined ? { id: email, email } : { id: email, email, name },
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    };
    this.session = session;
    this.notify();
    return session;
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.session);
  }
}
