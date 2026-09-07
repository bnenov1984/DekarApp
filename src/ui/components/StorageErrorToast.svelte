<script lang="ts">
  // PO follow-up (UX review, item B10 "storage error as toast") — a save failure is the one
  // condition in this whole autosave-everything, no-Save-button app (PD-012 D6) where the user's
  // work is genuinely at risk of not persisting; it previously surfaced as 11.5px text tucked into
  // the status bar, the same visual weight as the snap-on/off indicator next to it. Mounted once
  // in App.svelte (not Studio-only) — a save can fail from Home's importImageProject too.
  import { storageErrorMessage, dismissStorageError } from '../stores/persistence.js';
  import Icon from './Icon.svelte';
</script>

{#if $storageErrorMessage}
  <div class="toast" role="alert" data-testid="storage-error-toast">
    <span class="icon"><Icon name="warning" size={16} /></span>
    <span class="message">{$storageErrorMessage}</span>
    <button type="button" class="dismiss" on:click={dismissStorageError} aria-label="Dismiss" data-testid="storage-error-dismiss">
      ✕
    </button>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    bottom: 44px;
    transform: translateX(-50%);
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: min(480px, calc(100vw - 32px));
    padding: 10px 14px;
    background: var(--af-surface-raised);
    border: 1px solid var(--af-warning);
    border-radius: var(--af-radius-md);
    box-shadow: var(--af-shadow-e3);
  }

  .icon {
    flex: 0 0 auto;
    display: flex;
    color: var(--af-warning);
  }

  .message {
    font-size: 12.5px;
    font-weight: 550;
    color: var(--af-ink-primary);
  }

  .dismiss {
    flex: 0 0 auto;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: auto;
    background: none;
    border: none;
    border-radius: var(--af-radius-sm);
    font-size: 11px;
    color: var(--af-ink-tertiary);
    cursor: pointer;
  }

  .dismiss:hover {
    background: var(--af-surface-app);
    color: var(--af-ink-primary);
  }

  .dismiss:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: 1px;
  }
</style>
