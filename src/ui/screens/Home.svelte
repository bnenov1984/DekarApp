<script lang="ts">
  // 15_UX_SPECIFICATION.md §6/W4 — Home: three Start affordances. Map and Import still need
  // adapters that don't exist yet (MapProvider, file-parsing — P-05 territory), shown honestly as
  // not-yet-available. Recent (15 W4) is live as of the Persistence slice — real
  // ProjectRepository.list() cards, "recognized by its result" (preview area, not a thumbnail —
  // no render-to-static-image pipeline exists, W4's literal preview thumbnails are a later slice).
  import { onMount } from 'svelte';
  import { startBlankProject, loadProject, recentProjects, refreshRecentProjects } from '../stores/appState.js';
  import type { Unit } from '../../core/domain/types.js';

  onMount(refreshRecentProjects);

  function formatArea(area: number, unit: Unit): string {
    const rounded = Math.round(area);
    const label = unit === 'px' ? 'px²' : unit === 'm2' ? 'm²' : unit === 'ft2' ? 'ft²' : unit;
    return `${rounded} ${label}`;
  }
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

  {#if $recentProjects.length > 0}
    <div class="recent">
      <p class="recent-header">Recent</p>
      <div class="recent-cards">
        {#each $recentProjects as project (project.id)}
          <button class="recent-card" on:click={() => loadProject(project.id)} data-testid="recent-card">
            <span class="recent-name">{project.name}</span>
            <span class="recent-value">
              {project.totalArea !== undefined && project.totalAreaUnit
                ? formatArea(project.totalArea, project.totalAreaUnit)
                : '—'}
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
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

  .recent {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .recent-header {
    margin: 0;
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--af-ink-tertiary);
  }

  .recent-cards {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .recent-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 128px;
    padding: 14px;
    background: var(--af-surface-panel);
    border: 1px solid var(--af-border-subtle);
    border-radius: var(--af-radius-md);
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }

  .recent-card:hover {
    box-shadow: var(--af-shadow-e1);
  }

  .recent-card:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: 2px;
  }

  .recent-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--af-ink-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .recent-value {
    font-size: 12px;
    color: var(--af-ink-secondary);
    font-variant-numeric: tabular-nums;
  }
</style>
