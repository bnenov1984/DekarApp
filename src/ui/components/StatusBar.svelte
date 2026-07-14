<script lang="ts">
  // 15_UX_SPECIFICATION.md §6/W1 — StatusBar: 28px. Scale/units/zoom/snap/sync are wired once
  // there is a Surface to report on (UI commit 2+) — this bootstrap step only establishes the
  // fixed-height band.
</script>

<footer class="statusbar" aria-hidden="true"></footer>

<style>
  .statusbar {
    height: 28px;
    flex: 0 0 28px;
    background: var(--af-surface-panel);
    border-top: 1px solid var(--af-border-subtle);
  }
</style>
