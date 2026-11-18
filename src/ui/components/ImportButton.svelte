<script lang="ts">
  // 15 §2.2 (Photoshop layout, 2026-10-11) — Import is a file action, not a drawing tool, so it
  // lives in the top bar beside Export rather than in the tool bar. Reuses `importImageProject`
  // verbatim — same MIME validation / decode / Result-error contract as before the move.
  //
  // PO request (PDF import, grilling session 2026-11-18) — PDF joins PNG/JPG on this same button
  // rather than a separate entry point (this app's own "one minimal affordance" convention,
  // 15_UX_SPECIFICATION §1); dispatch on `file.type` to whichever import function actually knows
  // the format. `importing` is a minimal "don't look frozen" indicator (grilling Q9) — not the
  // staged/cancelable design 15 §17 describes, which was never built even for images; a PDF page
  // render is the first import path where a multi-second wait is actually likely.
  import { calibrating } from '../stores/calibrationSession.js';
  import { splittingId } from '../stores/splitSession.js';
  import { importImageProject, importPdfProject, type ImportImageError, type ImportPdfError } from '../stores/appState.js';
  import Icon from './Icon.svelte';

  let fileInput: HTMLInputElement;
  let importError: ImportImageError | ImportPdfError | null = null;
  let importErrorDetail: string | null = null; // the one case a static message can't cover: "this PDF has N pages"
  let importing = false;

  const IMPORT_ERROR_MESSAGES: Record<ImportImageError | ImportPdfError, string> = {
    UNSUPPORTED_FORMAT: 'Unsupported file — only PNG, JPG, or PDF can be imported yet.',
    CORRUPT_FILE: "That file couldn't be read.",
    PASSWORD_PROTECTED: "That PDF is password-protected — remove the password and try again.",
    MULTI_PAGE_NOT_SUPPORTED: 'Only single-page PDFs can be imported right now.',
  };

  function openFilePicker(): void {
    importError = null;
    importErrorDetail = null;
    fileInput.click();
  }

  async function onFileChosen(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-choosing the same file after a failed attempt
    if (!file) return;

    importing = true;
    try {
      const result = file.type === 'application/pdf' ? await importPdfProject(file) : await importImageProject(file);
      importError = result.ok ? null : result.error;
      importErrorDetail =
        !result.ok && result.error === 'MULTI_PAGE_NOT_SUPPORTED' && 'pageCount' in result
          ? `This PDF has ${result.pageCount} pages — only single-page PDFs can be imported right now.`
          : null;
    } finally {
      importing = false;
    }
  }
</script>

<div class="import">
  <button
    type="button"
    class="import-button"
    title="Import a PNG, JPG, or PDF"
    disabled={$calibrating || !!$splittingId || importing}
    data-testid="topbar-import"
    on:click={openFilePicker}
  >
    <Icon name="image" size={15} />
    {importing ? 'Importing…' : 'Import'}
  </button>
  <input
    type="file"
    accept="image/png,image/jpeg,application/pdf"
    bind:this={fileInput}
    on:change={onFileChosen}
    class="visually-hidden"
    data-testid="topbar-import-input"
  />
  {#if importError}
    <p class="import-error" role="alert" data-testid="topbar-import-error">
      {importErrorDetail ?? IMPORT_ERROR_MESSAGES[importError]}
    </p>
  {/if}
</div>

<style>
  .import {
    position: relative;
  }

  .import-button {
    display: flex;
    align-items: center;
    gap: 6px;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--af-ink-secondary);
    background: none;
    border: 1px solid var(--af-border-subtle);
    padding: 5px 12px;
    border-radius: var(--af-radius);
    cursor: pointer;
  }

  .import-button:hover:not(:disabled) {
    color: var(--af-ink-primary);
    border-color: var(--af-ink-secondary);
  }

  .import-button:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: 1px;
  }

  .import-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .import-error {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 30;
    margin: 0;
    padding: 6px 12px;
    font-size: 12px;
    white-space: nowrap;
    color: var(--af-danger, #C62828);
    background: var(--af-surface-raised);
    border: 1px solid var(--af-border-strong);
    border-radius: var(--af-radius);
    box-shadow: var(--af-shadow-float);
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
</style>
