<script lang="ts">
  // Grilling 2026-11-19 (export PDF/JPEG/PNG) — replaces TopBar.svelte's single CSV-only "Export"
  // button (Q9) with a small menu, same toggle-button + absolute-panel pattern as ZoomMenu.svelte.
  // CSV keeps its pre-existing `hasMeasurements` gate (Q10); PNG/JPEG/PDF are gated on
  // `canExportPicture` instead — a picture is meaningful even with zero measurements (an imported
  // plan with nothing drawn on it yet), so they don't inherit CSV's stricter requirement.
  import { activeSurface } from '../stores/studioSession.js';
  import { backgroundImage } from '../stores/imageAssetSession.js';
  import { displayUnit } from '../stores/unitPreferenceSession.js';
  import { showEdgeLengths } from '../stores/drawingSession.js';
  import { buildMeasurementsCsv, csvFilename } from '../export/csvExport.js';
  import { exportSurfaceAsPicture, canExportPicture, type PictureFormat } from '../export/pictureExport.js';
  import { triggerDownload } from '../export/download.js';

  export let projectName: string | null = null;

  let open = false;
  let root: HTMLDivElement;
  let exporting = false;

  $: hasMeasurements = ($activeSurface?.layers.flatMap((l) => l.measurements) ?? []).length > 0;
  $: canImage = $activeSurface !== null && canExportPicture($activeSurface, $backgroundImage);
  $: anyEnabled = hasMeasurements || canImage;

  function toggle(): void {
    if (!anyEnabled) return;
    open = !open;
  }

  function close(): void {
    open = false;
  }

  function onWindowPointerDown(event: PointerEvent): void {
    if (open && !root.contains(event.target as Node)) close();
  }

  function downloadCsv(): void {
    const surface = $activeSurface;
    if (!surface) return;
    const csv = buildMeasurementsCsv(surface, $displayUnit);
    triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), csvFilename(projectName ?? 'areaflow-export'));
  }

  async function downloadPicture(format: PictureFormat): Promise<void> {
    const surface = $activeSurface;
    if (!surface) return;
    exporting = true;
    try {
      const result = await exportSurfaceAsPicture(surface, $backgroundImage, format, $displayUnit, $showEdgeLengths, projectName ?? 'areaflow-export');
      if (result) triggerDownload(result.blob, result.filename);
    } finally {
      exporting = false;
    }
  }

  function choose(action: () => void | Promise<void>): void {
    void action();
    close();
  }
</script>

<svelte:window on:pointerdown={onWindowPointerDown} />

<div class="export-menu" bind:this={root}>
  <button
    type="button"
    class="export-button"
    disabled={!anyEnabled}
    on:click={toggle}
    aria-haspopup="dialog"
    aria-expanded={open}
    title={anyEnabled ? 'Export' : 'Nothing to export yet'}
    data-testid="export-button"
  >
    Export
  </button>

  {#if open}
    <div class="panel" role="dialog" aria-label="Export" data-testid="export-menu">
      <button
        type="button"
        class="item"
        disabled={!hasMeasurements}
        title={hasMeasurements ? 'Export measurements as CSV' : 'Nothing to export yet'}
        on:click={() => choose(downloadCsv)}
        data-testid="export-csv"
      >
        CSV
      </button>
      <div class="separator"></div>
      <button
        type="button"
        class="item"
        disabled={!canImage || exporting}
        title={canImage ? 'Export a picture of the canvas' : 'Nothing to export yet'}
        on:click={() => choose(() => downloadPicture('png'))}
        data-testid="export-png"
      >
        PNG
      </button>
      <button
        type="button"
        class="item"
        disabled={!canImage || exporting}
        title={canImage ? 'Export a picture of the canvas' : 'Nothing to export yet'}
        on:click={() => choose(() => downloadPicture('jpeg'))}
        data-testid="export-jpeg"
      >
        JPEG
      </button>
      <button
        type="button"
        class="item"
        disabled={!canImage || exporting}
        title={canImage ? 'Export a picture of the canvas, wrapped in a PDF' : 'Nothing to export yet'}
        on:click={() => choose(() => downloadPicture('pdf'))}
        data-testid="export-pdf"
      >
        PDF
      </button>
    </div>
  {/if}
</div>

<style>
  .export-menu {
    position: relative;
  }

  .export-button {
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

  .export-button:hover:not(:disabled) {
    color: var(--af-ink-primary);
    border-color: var(--af-ink-secondary);
  }

  .export-button:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: 1px;
  }

  .export-button[aria-expanded='true'] {
    color: var(--af-ink-primary);
    border-color: var(--af-ink-secondary);
  }

  .export-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 40;
    width: 160px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    background: var(--af-surface-raised);
    border: 1px solid var(--af-border-strong);
    border-radius: var(--af-radius);
    box-shadow: var(--af-shadow-float);
    font-size: 12.5px;
  }

  .separator {
    height: 1px;
    margin: 6px 0;
    background: var(--af-border-subtle);
  }

  .item {
    padding: 5px 8px;
    font: inherit;
    text-align: left;
    color: var(--af-ink-primary);
    background: none;
    border: none;
    border-radius: var(--af-radius);
    cursor: pointer;
  }

  .item:hover:not(:disabled) {
    background: var(--af-surface-app);
  }

  .item:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: -2px;
  }

  .item:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
