<script lang="ts">
  // 15_UX_SPECIFICATION.md §6/W1 — TopBar: 48px, identity only. Project name / workspace chip /
  // share / export are wired in UI commit 2 (Project workspace) — this bootstrap step only
  // establishes the fixed-height chrome band and the logo mark.
</script>

<header class="topbar">
  <div class="logo">
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
  </div>
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
  }
</style>
