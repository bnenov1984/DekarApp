<script lang="ts">
  // 15_UX_SPECIFICATION.md §6/W1 — StatusBar: 28px. Scale/units/zoom/sync remain unwired (no
  // Calibration UI / persistence yet) — only the snap indicator (15 W1 "⌗snap on") is live,
  // added with the Tool Dock slice since snap toggling (`S`) now exists.
  import { snapEnabled, toggleSnap } from '../stores/drawingSession.js';
</script>

<footer class="statusbar">
  <button type="button" class="snap-indicator" on:click={toggleSnap} data-testid="snap-indicator">
    ⌗ snap {$snapEnabled ? 'on' : 'off'}
  </button>
</footer>

<style>
  .statusbar {
    height: 28px;
    flex: 0 0 28px;
    display: flex;
    align-items: center;
    background: var(--af-surface-panel);
    border-top: 1px solid var(--af-border-subtle);
    padding: 0 10px;
  }

  .snap-indicator {
    background: none;
    border: none;
    padding: 2px 6px;
    border-radius: var(--af-radius-sm);
    font-size: 11.5px;
    color: var(--af-ink-secondary);
    cursor: pointer;
  }

  .snap-indicator:hover {
    background: var(--af-surface-app);
    color: var(--af-ink-primary);
  }
</style>
