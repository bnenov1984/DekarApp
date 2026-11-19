<script lang="ts">
  // 15_UX_SPECIFICATION.md §6/W1 — TopBar: 48px. Workspace chip/share are still not wired — no
  // Workspace catalog exists in code yet. Export itself is now a menu (ExportMenu.svelte,
  // grilling 2026-11-19): CSV, plus PNG/JPEG/PDF picture exports (PD-029).
  //
  // PO follow-up ("simplify entry flow") — the logo previously doubled as "back to Home"
  // (`onBack` prop); Home is no longer part of the default flow (appState.ts always opens
  // Studio directly) and TopBar is only ever rendered inside Studio now, so `onBack` — which
  // really just meant "are we in Studio" — is dropped entirely: Export/rename/undo/redo render
  // unconditionally, and the logo becomes plain decorative branding (no click handler).
  //
  // PO follow-up (UX review, item B1 "undo/redo buttons") — canUndo/canRedo/undo/redo already
  // existed as session-wide stores (studioSession.ts) with no visible UI beyond Ctrl+Z/Y.
  //
  // 15 §2.2 (Photoshop layout, 2026-10-11) — items are grouped by kind, left to right: identity
  // (logo, project name) · history (Undo/Redo) · spacer · file actions (Import, Export) · account.
  // Every item is a flex child of the bar; nothing is positioned over it (the account menu used to
  // be `position: fixed` in the window corner, where it covered Undo/Redo).
  //
  // PD-026 — the logo mark/wordmark here now match the public landing page (src/ui/index.html's
  // nav logo, same inline SVG path data as docs/mockups/brand/dekar-mark.svg): the "Dekar" market
  // name is approved, and the logo was explicitly named as one of the still-deferred spots. The
  // rest of PD-026's rename (page <title>, repo/package name, Render service, domain) stays
  // "AreaFlow" until that separate task.
  import { canUndo, canRedo, undo, redo } from '../stores/studioSession.js';
  import { renameProject } from '../stores/appState.js';
  import { tick } from 'svelte';
  import ImportButton from './ImportButton.svelte';
  import ExportMenu from './ExportMenu.svelte';
  import AccountMenu from './AccountMenu.svelte';
  import { viewOnly } from '../stores/panelLayoutSession.js';

  export let projectName: string | null = null;

  // PO follow-up (UX review, item A7 "project rename") — every project was permanently
  // "Untitled"; same click-to-edit/Enter-commits/Escape-cancels pattern as MeasurementChip's
  // inline rename (chip rename precedent, this codebase's one established convention for it).
  let editing = false;
  let nameDraft = '';
  let inputEl: HTMLInputElement | undefined;

  function startEditing(): void {
    if (projectName === null || $viewOnly) return; // only renameable when a project is open, and not view-only (PD-022)
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
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1.5 V5.4" stroke="currentColor" stroke-width="1.4" />
      <rect x="10" y="5.4" width="4" height="2.3" fill="currentColor" />
      <path d="M8 7.7 H16 V11.6 L12 18.6 L8 11.6 Z" fill="currentColor" />
      <path d="M3.5 21.4 H8.6 M15.4 21.4 H20.5" stroke="currentColor" stroke-width="1.2" />
      <rect x="10.4" y="19.8" width="3.2" height="3.2" fill="var(--af-accent)" />
    </svg>
    <span>Dekar</span>
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

  <!-- PD-022 / 15 §11 — view-only (<1024px): the bar keeps only the title, Export and the account. -->
  {#if !$viewOnly}
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

  {/if}

  <span class="spacer"></span>

  {#if !$viewOnly}
    <ImportButton />
  {/if}
  <ExportMenu {projectName} />
  <AccountMenu />
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
    border-radius: var(--af-radius);
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
    border-radius: var(--af-radius);
    padding: 3px 5px;
    width: 200px;
  }

  .spacer {
    flex: 1;
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
    border-radius: var(--af-radius);
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
