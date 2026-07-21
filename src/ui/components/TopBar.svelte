<script lang="ts">
  // 15_UX_SPECIFICATION.md §6/W1 — TopBar: 48px. Workspace chip/share/export are still not wired
  // beyond the v1 CSV export below — no Workspace catalog and no full Export pipeline exist in
  // code yet.
  //
  // PO follow-up ("simplify entry flow") — the logo previously doubled as "back to Home"
  // (`onBack` prop); Home is no longer part of the default flow (appState.ts always opens
  // Studio directly) and TopBar is only ever rendered inside Studio now, so `onBack` — which
  // really just meant "are we in Studio" — is dropped entirely: Export/rename/undo/redo render
  // unconditionally, and the logo becomes plain decorative branding (no click handler).
  //
  // PO follow-up (UX review, item B1 "undo/redo buttons") — canUndo/canRedo/undo/redo already
  // existed as session-wide stores (studioSession.ts) with no visible UI beyond Ctrl+Z/Y.
  import { canUndo, canRedo, undo, redo, activeSurface } from '../stores/studioSession.js';
  import { renameProject } from '../stores/appState.js';
  import { displayUnit } from '../stores/unitPreferenceSession.js';
  import { buildMeasurementsCsv, csvFilename } from '../export/csvExport.js';
  import { tick } from 'svelte';

  export let projectName: string | null = null;

  // PO follow-up (UX review, item A1 "no export", v1 scope) — the app previously had no way to
  // get measurements out at all; a v1 CSV export closes that loop (a full templated Report/PDF
  // pipeline is modeled in the domain — entities.ts's Report/ReportSnapshot — but genuinely
  // unbuilt, out of scope for this pass). Disabled with nothing to export, same "nothing to do"
  // gating as Undo/Redo above.
  $: hasMeasurements = ($activeSurface?.layers.flatMap((l) => l.measurements) ?? []).length > 0;

  function onExportClick(): void {
    const surface = $activeSurface;
    if (!surface) return;
    const csv = buildMeasurementsCsv(surface, $displayUnit);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = csvFilename(projectName ?? 'areaflow-export');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // PO follow-up (UX review, item A7 "project rename") — every project was permanently
  // "Untitled"; same click-to-edit/Enter-commits/Escape-cancels pattern as MeasurementChip's
  // inline rename (chip rename precedent, this codebase's one established convention for it).
  let editing = false;
  let nameDraft = '';
  let inputEl: HTMLInputElement | undefined;

  function startEditing(): void {
    if (projectName === null) return; // only renameable when a project is actually open
    editing = true;
    nameDraft = projectName;
    void tick().then(() => {
      inputEl?.focus();
      inputEl?.select();
    });
  }

  function commit(): void {
    if (!editing) return;
    editing = false;
    renameProject(nameDraft);
  }

  function cancel(): void {
    editing = false;
  }

  function onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
    event.stopPropagation(); // don't let Studio's Delete/Backspace/tool shortcuts fire while typing
  }
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

  {#if projectName}
    {#if editing}
      <input
        type="text"
        class="project-name-input"
        bind:this={inputEl}
        bind:value={nameDraft}
        on:blur={commit}
        on:keydown={onInputKeydown}
        aria-label="Rename project"
        data-testid="project-name-input"
      />
    {:else}
      <button
        type="button"
        class="project-name editable"
        on:click={startEditing}
        title="Click to rename"
        data-testid="project-name"
      >
        {projectName}
      </button>
    {/if}
  {/if}

  <button
    type="button"
    class="export-button"
    disabled={!hasMeasurements}
    on:click={onExportClick}
    title={hasMeasurements ? 'Export measurements as CSV' : 'Nothing to export yet'}
    data-testid="export-csv"
  >
    Export
  </button>
  <div class="history-controls">
    <button
      type="button"
      class="history-button"
      disabled={!$canUndo}
      on:click={undo}
      title="Undo (Ctrl+Z)"
      aria-label="Undo"
      data-testid="topbar-undo"
    >
      ↶
    </button>
    <button
      type="button"
      class="history-button"
      disabled={!$canRedo}
      on:click={redo}
      title="Redo (Ctrl+Shift+Z)"
      aria-label="Redo"
      data-testid="topbar-redo"
    >
      ↷
    </button>
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
    padding: 4px 6px;
  }

  .project-name {
    font: inherit;
    font-size: 13px;
    font-weight: 550;
    color: var(--af-ink-primary);
    background: none;
    border: none;
    padding: 4px 6px;
    border-radius: var(--af-radius-sm);
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-name.editable {
    cursor: text;
  }

  .project-name.editable:hover {
    background: var(--af-surface-app);
  }

  .project-name:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: -1px;
  }

  .project-name-input {
    font: inherit;
    font-size: 13px;
    font-weight: 550;
    color: var(--af-ink-primary);
    background: var(--af-surface-app);
    border: 1px solid var(--af-accent);
    border-radius: var(--af-radius-sm);
    padding: 3px 5px;
    width: 200px;
  }

  .export-button {
    margin-left: auto;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--af-ink-secondary);
    background: none;
    border: 1px solid var(--af-border-subtle);
    padding: 5px 12px;
    border-radius: var(--af-radius-sm);
    cursor: pointer;
  }

  .export-button:hover:not(:disabled) {
    color: var(--af-ink-primary);
    border-color: var(--af-ink-secondary);
  }

  .export-button:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: 1px;
  }

  .export-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .history-controls {
    display: flex;
    gap: 2px;
  }

  .history-button {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    background: none;
    border: none;
    border-radius: var(--af-radius-sm);
    color: var(--af-ink-secondary);
    cursor: pointer;
  }

  .history-button:hover:not(:disabled) {
    background: var(--af-surface-app);
    color: var(--af-ink-primary);
  }

  .history-button:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: -2px;
  }

  .history-button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
</style>
