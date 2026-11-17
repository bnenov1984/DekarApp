<script lang="ts">
  // 15_UX_SPECIFICATION.md §6/W4 — Home: three Start affordances. Map still needs an adapter
  // that doesn't exist yet (MapProvider — P-05 territory), shown honestly as not-yet-available.
  // Import (PNG/JPG, PD-011 v1 scope) is wired to appState.ts's importImageProject; PDF/Map
  // import are separate, larger slices (multi-Surface-per-file / MapProvider respectively), not
  // this one. Recent (15 W4) is live as of the Persistence slice — real ProjectRepository.list()
  // cards, "recognized by its result" (preview area, not a thumbnail — no render-to-static-image
  // pipeline exists, W4's literal preview thumbnails are a later slice).
  import { onMount } from 'svelte';
  import {
    startBlankProject,
    loadProject,
    importImageProject,
    recentProjects,
    refreshRecentProjects,
    type ImportImageError,
  } from '../stores/appState.js';
  import Icon from '../components/Icon.svelte';
  import type { Unit } from '../../core/domain/types.js';

  onMount(refreshRecentProjects);

  // PO follow-up (UX review, item B2 "thousands separators") — same grouped-number treatment as
  // computeDisplay.ts's formatAreaValue (Studio's own labels); this one stays a local, cruder
  // whole-number rounding since Recent cards don't carry a Measurement's actual precision context
  // (no calibration decimals to respect here, just "how big is this project" at a glance).
  const areaNumberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

  function formatArea(area: number, unit: Unit): string {
    const rounded = areaNumberFormat.format(area);
    const label = unit === 'px' ? 'px²' : unit === 'm2' ? 'm²' : unit === 'ft2' ? 'ft²' : unit;
    return `${rounded} ${label}`;
  }

  let fileInput: HTMLInputElement;
  let importError: ImportImageError | null = null;

  const IMPORT_ERROR_MESSAGES: Record<ImportImageError, string> = {
    UNSUPPORTED_FORMAT: 'Unsupported file — only PNG and JPG images can be imported yet.',
    CORRUPT_FILE: "That file couldn't be read as an image.",
  };

  function openFilePicker(): void {
    importError = null;
    fileInput.click();
  }

  async function onFileChosen(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-choosing the same file after a failed attempt
    if (!file) return;

    const result = await importImageProject(file);
    importError = result.ok ? null : result.error;
  }
</script>

<div class="home">
  <div class="hero">
    <p class="eyebrow">Dekar</p>
    <h1>Measure anything.</h1>
  </div>

  <div class="cards">
    <button class="card" on:click={startBlankProject}>
      <span class="icon"><Icon name="grid" size={28} /></span>
      <span class="title">Blank canvas</span>
      <span class="desc">Start drawing directly</span>
    </button>

    <button class="card disabled" disabled title="Needs a map provider — not wired up yet">
      <span class="icon"><Icon name="map-pin" size={28} /></span>
      <span class="title">On a map</span>
      <span class="desc">Coming soon</span>
    </button>

    <button class="card" on:click={openFilePicker}>
      <span class="icon"><Icon name="image" size={28} /></span>
      <span class="title">Import a file</span>
      <span class="desc">PNG or JPG</span>
    </button>
    <input
      type="file"
      accept="image/png,image/jpeg"
      bind:this={fileInput}
      on:change={onFileChosen}
      class="visually-hidden"
      data-testid="import-file-input"
    />
  </div>

  {#if importError}
    <p class="import-error" data-testid="import-error">{IMPORT_ERROR_MESSAGES[importError]}</p>
  {/if}

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
    border-radius: var(--af-radius);
    cursor: pointer;
    font-family: inherit;
  }

  /* No shadow-lift on hover — a border-colour change instead, the same cue every bordered
     control elsewhere in the app uses. */
  .card:hover:not(.disabled) {
    border-color: var(--af-border-strong);
    background: var(--af-surface-app);
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
    color: var(--af-accent);
    margin-bottom: 2px;
  }

  .card.disabled .icon {
    color: var(--af-ink-tertiary);
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

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .import-error {
    margin: -24px 0 0;
    font-size: 12.5px;
    color: var(--af-danger, #C62828);
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
    border-radius: var(--af-radius);
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }

  .recent-card:hover {
    border-color: var(--af-border-strong);
    background: var(--af-surface-app);
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
