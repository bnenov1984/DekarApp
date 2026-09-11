<script lang="ts">
  // docs/26_ADR/ADR-007 Phase 2 — the entire login/logout UI surface for the SaaS migration.
  // Mounted once in App.svelte (like StorageErrorToast), never inside Studio/Home themselves —
  // PD-014's Workspace Contract (Tool Dock, panel positions, keys, core flows) stays untouched,
  // and PD-012's local-first promise holds: nobody has to touch this to draw and split parcels.
  import { authSession, authError, authPending, signIn, signUp, signOut, dismissAuthError } from '../stores/authSession.js';
  import { authAdapter } from '../stores/persistence.js';
  import Icon from './Icon.svelte';

  let open = false;
  let mode: 'signIn' | 'signUp' = 'signIn';
  let email = '';
  let password = '';
  let name = '';
  let resetSent = false;

  function toggle(): void {
    open = !open;
    if (!open) resetForm();
  }

  function resetForm(): void {
    dismissAuthError();
    resetSent = false;
  }

  function switchMode(next: 'signIn' | 'signUp'): void {
    mode = next;
    dismissAuthError();
  }

  async function submit(): Promise<void> {
    const ok = mode === 'signIn' ? await signIn(email, password) : await signUp(email, password, name || undefined);
    if (ok) {
      open = false;
      email = '';
      password = '';
      name = '';
    }
  }

  async function requestReset(): Promise<void> {
    if (!email) {
      authError.set('Enter your email above first.');
      return;
    }
    await authAdapter.requestPasswordReset(email);
    resetSent = true;
  }

  async function handleSignOut(): Promise<void> {
    await signOut();
    open = false;
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && open) {
      open = false;
      resetForm();
    }
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="account-menu">
  <button
    type="button"
    class="trigger"
    on:click={toggle}
    aria-expanded={open}
    data-testid="account-menu-trigger"
  >
    <Icon name="user" size={14} />
    <span>{$authSession ? ($authSession.user.name ?? $authSession.user.email) : 'Sign in'}</span>
  </button>

  {#if open}
    <div class="panel" role="dialog" aria-label={$authSession ? 'Account' : 'Sign in'} data-testid="account-menu-panel">
      {#if $authSession}
        <p class="signed-in-as">Signed in as<br /><strong>{$authSession.user.email}</strong></p>
        <button type="button" class="primary" on:click={handleSignOut} data-testid="sign-out-button">Sign out</button>
      {:else}
        <div class="tabs">
          <button type="button" class:active={mode === 'signIn'} on:click={() => switchMode('signIn')}>Sign in</button>
          <button type="button" class:active={mode === 'signUp'} on:click={() => switchMode('signUp')}>Create account</button>
        </div>

        <form on:submit|preventDefault={submit}>
          {#if mode === 'signUp'}
            <label for="account-menu-name">Name</label>
            <input id="account-menu-name" type="text" bind:value={name} autocomplete="name" />
          {/if}

          <label for="account-menu-email">Email</label>
          <input id="account-menu-email" type="email" required bind:value={email} autocomplete="email" data-testid="account-email-input" />

          <label for="account-menu-password">Password</label>
          <input
            id="account-menu-password"
            type="password"
            required
            minlength="8"
            bind:value={password}
            autocomplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            data-testid="account-password-input"
          />

          {#if $authError}
            <p class="error" role="alert">{$authError}</p>
          {/if}
          {#if resetSent}
            <p class="hint">If that email has an account, a reset link is on its way.</p>
          {/if}

          <button type="submit" class="primary" disabled={$authPending} data-testid="account-submit-button">
            {#if $authPending}Working…{:else if mode === 'signIn'}Sign in{:else}Create account{/if}
          </button>

          {#if mode === 'signIn'}
            <button type="button" class="link" on:click={requestReset}>Forgot password?</button>
          {/if}
        </form>
      {/if}
    </div>
  {/if}
</div>

<style>
  .account-menu {
    position: fixed;
    top: 10px;
    right: 12px;
    z-index: 900;
    font-size: 12.5px;
  }

  .trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: var(--af-surface-raised);
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-sm);
    box-shadow: var(--af-shadow-e1);
    color: var(--af-ink-secondary);
    font-weight: 550;
    cursor: pointer;
    max-width: 200px;
  }

  .trigger span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trigger:hover {
    color: var(--af-ink-primary);
    border-color: var(--af-ink-tertiary);
  }

  .trigger:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: 1px;
  }

  .panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    width: 260px;
    padding: 14px;
    background: var(--af-surface-raised);
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-md);
    box-shadow: var(--af-shadow-e3);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .signed-in-as {
    margin: 0;
    color: var(--af-ink-secondary);
    line-height: 1.5;
  }

  .signed-in-as strong {
    color: var(--af-ink-primary);
  }

  .tabs {
    display: flex;
    gap: 4px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--af-border-subtle);
  }

  .tabs button {
    flex: 1;
    padding: 6px 4px;
    background: none;
    border: none;
    border-radius: var(--af-radius-sm);
    color: var(--af-ink-tertiary);
    cursor: pointer;
    font-weight: 550;
  }

  .tabs button.active {
    background: var(--af-surface-app);
    color: var(--af-ink-primary);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  label {
    margin-top: 6px;
    color: var(--af-ink-secondary);
    font-weight: 550;
  }

  input {
    padding: 7px 8px;
    background: var(--af-surface-app);
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-sm);
    color: var(--af-ink-primary);
    font: inherit;
  }

  input:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: 1px;
  }

  .primary {
    margin-top: 8px;
    padding: 8px;
    background: var(--af-accent);
    color: var(--af-accent-ink);
    border: none;
    border-radius: var(--af-radius-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .primary:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .primary:focus-visible {
    outline: 2px solid var(--af-ink-primary);
    outline-offset: 1px;
  }

  .link {
    align-self: center;
    margin-top: 2px;
    background: none;
    border: none;
    color: var(--af-ink-tertiary);
    text-decoration: underline;
    cursor: pointer;
    font-size: 11.5px;
  }

  .error {
    margin: 0;
    color: var(--af-warning);
    font-weight: 550;
  }

  .hint {
    margin: 0;
    color: var(--af-ink-tertiary);
  }
</style>
