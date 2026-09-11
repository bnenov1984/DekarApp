import type { Result } from '../../core/domain/types.js';

// docs/23_API.md §4 / docs/26_ADR/ADR-007 — a port, not an implementation: no Better Auth type
// appears here, by the same construction rule as every other file in this directory. Phase 1 of
// the SaaS migration (ADR-007) — this file defines the contract only; nothing implements or
// calls it yet, so it carries zero regression risk for the existing local-only IndexedDB path.
// PD-012 unaffected: a UI that never calls this port behaves exactly as it does today — this
// adapter is additive, never a new required dependency of any existing flow.

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly name?: string;
}

export interface AuthSession {
  readonly user: AuthUser;
  readonly expiresAt: string;
}

export type AuthErrorReason = 'INVALID_CREDENTIALS' | 'EMAIL_ALREADY_REGISTERED' | 'NETWORK_ERROR';

export interface AuthError {
  readonly reason: AuthErrorReason;
}

export interface AuthAdapter {
  getSession(): Promise<AuthSession | null>;
  signInWithPassword(email: string, password: string): Promise<Result<AuthSession, AuthError>>;
  signUpWithPassword(email: string, password: string, name?: string): Promise<Result<AuthSession, AuthError>>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  /** fires whenever the session is established, refreshed, or cleared — UI subscribes to drive
   * logged-in/out chrome without polling `getSession()`. Returns an unsubscribe function, same
   * convention as every other event-subscription callback in this codebase. */
  onSessionChange(callback: (session: AuthSession | null) => void): () => void;
}
