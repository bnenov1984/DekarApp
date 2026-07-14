<script lang="ts">
  // 15_UX_SPECIFICATION.md §6/W1 — TopBar: 48px. Logo doubles as back-to-Home (15 §5 D6:
  // "логото/back... 1 клик", project stays alive — autosave semantics, in-memory only until a
  // real Repository exists, ISS-008). Workspace chip/share/export are still not wired — no
  // Workspace catalog and no Export pipeline exist in code yet.
  export let projectName: string | null = null;
  export let onBack: (() => void) | null = null;
</script>

<header class="topbar">
  <button
    class="logo"
    on:click={() => onBack?.()}
    disabled={!onBack}
    aria-label={onBack ? 'Back to Home' : undefined}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8 L4 20 L16 20"
        stroke="var(--af-accent)"
        stroke-width="2.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M9 4 L20 4 L20 15 Z" fill="var(--af-accent)" opacity="0.85" />
    </svg>
    <span>AreaFlow</span>
  </button>

  {#if projectName}
    <span class="project-name">{projectName}</span>
  {/if}
</header>

<style>
  .topbar {
    height: 48px;
    flex: 0 0 48px;
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--af-surface-panel);
    border-bottom: 1px solid var(--af-border-subtle);
    padding: 0 12px;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 7px;
    font-weight: 700;
    font-size: 14.5px;
    background: none;
    border: none;
    padding: 4px 6px;
    border-radius: var(--af-radius-sm);
  }

  .logo:not(:disabled) {
    cursor: pointer;
  }

  .logo:not(:disabled):hover {
    background: var(--af-surface-app);
  }

  .project-name {
    font-size: 13px;
    font-weight: 550;
    color: var(--af-ink-primary);
  }
</style>
