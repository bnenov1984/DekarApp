import { writable } from 'svelte/store';
import type { AuthSession } from '../../application/ports/authAdapter.js';
import { authAdapter } from './persistence.js';

// docs/26_ADR/ADR-007 Phase 2 — the UI-facing view of "who's signed in", same module-level-store
// convention as unitPreferenceSession.ts (ADR-006 addendum). PD-012 untouched: nothing in
// appState.ts's local-only project flow reads this store — a signed-out visitor's experience is
// unchanged; this is additive UI, never a gate in front of an existing flow.

export const authSession = writable<AuthSession | null>(null);
export const authError = writable<string | null>(null);
export const authPending = writable(false);

let unsubscribeFromAdapter: (() => void) | null = null;

/** Called once from App.svelte's onMount, same shape as initUnitPreference — one initial read,
 * then stays live via the adapter's own change notifications for the rest of the tab's life. */
export async function initAuthSession(): Promise<void> {
  authSession.set(await authAdapter.getSession());
  unsubscribeFromAdapter?.();
  unsubscribeFromAdapter = authAdapter.onSessionChange((session) => authSession.set(session));
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  EMAIL_ALREADY_REGISTERED: 'An account with that email already exists.',
  NETWORK_ERROR: "Couldn't reach the server — check your connection and try again.",
};

export async function signIn(email: string, password: string): Promise<boolean> {
  authPending.set(true);
  authError.set(null);
  const result = await authAdapter.signInWithPassword(email, password);
  authPending.set(false);
  if (!result.ok) {
    authError.set(AUTH_ERROR_MESSAGES[result.reason.reason] ?? 'Something went wrong.');
    return false;
  }
  authSession.set(result.value);
  return true;
}

export async function signUp(email: string, password: string, name?: string): Promise<boolean> {
  authPending.set(true);
  authError.set(null);
  const result = await authAdapter.signUpWithPassword(email, password, name);
  authPending.set(false);
  if (!result.ok) {
    authError.set(AUTH_ERROR_MESSAGES[result.reason.reason] ?? 'Something went wrong.');
    return false;
  }
  authSession.set(result.value);
  return true;
}

export async function signOut(): Promise<void> {
  await authAdapter.signOut();
  authSession.set(null);
}

export function dismissAuthError(): void {
  authError.set(null);
}
