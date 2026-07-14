<script lang="ts">
  // 15_UX_SPECIFICATION.md §6/W4 — Home: three Start affordances. Map and Import need adapters
  // that don't exist yet (MapProvider, StorageAdapter — ISS-008/P-05 territory) so they're shown
  // honestly as not-yet-available rather than silently working differently than they claim to.
  // No Recent projects list yet either — that needs ProjectRepository.list() (23 §3.1), and
  // there is still no repository implementation, only the port.
  import { startBlankProject } from '../stores/appState.js';
</script>

<div class="home">
  <div class="hero">
    <p class="eyebrow">AreaFlow</p>
    <h1>Measure anything.</h1>
  </div>

  <div class="cards">
    <button class="card" on:click={startBlankProject}>
      <span class="icon" aria-hidden="true">▦</span>
      <span class="title">Blank canvas</span>
      <span class="desc">Start drawing directly</span>
    </button>

    <button class="card disabled" disabled title="Needs a map provider — not wired up yet">
      <span class="icon" aria-hidden="true">🗺</span>
      <span class="title">On a map</span>
      <span class="desc">Coming soon</span>
    </button>

    <button class="card disabled" disabled title="Needs file import — not wired up yet">
      <span class="icon" aria-hidden="true">🖼</span>
      <span class="title">Import a file</span>
      <span class="desc">Coming soon</span>
    </button>
  </div>
</div>

<style>
  .home {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 40px;
    padding: 24px;
    background: var(--af-surface-app);
  }

  .hero {
    text-align: center;
  }

  .eyebrow {
    margin: 0 0 6px;
    font-size: 11px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--af-ink-tertiary);
  }

  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 650;
  }

  .cards {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 160px;
    padding: 24px 16px;
    background: var(--af-surface-panel);
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-md);
    box-shadow: var(--af-shadow-e1);
    cursor: pointer;
    font-family: inherit;
  }

  .card:hover:not(.disabled) {
    box-shadow: var(--af-shadow-e2);
  }

  .card:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: 2px;
  }

  .card.disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .icon {
    font-size: 28px;
  }

  .title {
    font-weight: 600;
    font-size: 14px;
    color: var(--af-ink-primary);
  }

  .desc {
    font-size: 12px;
    color: var(--af-ink-secondary);
  }
</style>
